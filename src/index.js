import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { chromium, devices } from 'playwright';
import { createWorker } from 'tesseract.js';

const DEFAULT_CONFIG = {
  baseUrl: 'http://my.gzsums.net:1198/wap/index',
  authFile: 'auth.json',
  headless: false,
  keepOpen: true,
  interactive: true,
  geolocation: {
    enabled: true,
    latitude: 23.132443,
    longitude: 113.297552,
    accuracy: 30
  },
  username: '',
  password: '',
  selectors: {
    username: "input[name='username'], input[name='account'], input[type='tel'], input[type='text']",
    password: "input[name='password'], input[type='password']",
    captchaInput: "input[name='captcha'], input[name='verifyCode'], input[name='code'], input[placeholder*='验证码']",
    captchaImage: "img[src*='captcha'], img[src*='verify'], img[src*='code'], canvas",
    submit: "#login, .login, .login-btn, .btn-login, button[type='submit'], input[type='submit'], input[value='登录'], button:has-text('登录'), a:has-text('登录')"
  },
  attendance: {
    enabled: false,
    entryText: '实习签到',
    url: '/Wap/WapExStuLog',
    autoConfirm: true,
    resultScreenshot: 'attendance-result.png',
    successTexts: ['待确认', '已签到', '已确认', '签到成功'],
    morning: {
      label: '上午',
      start: '05:00',
      end: '08:00'
    },
    afternoon: {
      label: '下午',
      start: '13:00',
      end: '14:30'
    }
  },
  captcha: {
    ocr: true,
    manualFallback: true,
    minConfidence: 0,
    maxAttempts: 3,
    refreshSelector: '',
    expectedLength: 4,
    characters: 'numeric',
    preprocess: true
  }
};

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));

async function main() {
  const config = await loadConfig();
  const authPath = path.resolve(rootDir, config.authFile);
  const forceLogin = args.has('--login');
  const shouldSign = args.has('--sign') || config.attendance.enabled;
  const hasAuth = existsSync(authPath) && !forceLogin;
  const browser = await chromium.launch({ headless: config.headless });

  try {
    const context = await browser.newContext({
      ...(hasAuth ? { storageState: authPath } : {}),
      ...devices['iPhone 14 Pro'],
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      ...(config.geolocation.enabled ? {
        geolocation: {
          latitude: Number(config.geolocation.latitude),
          longitude: Number(config.geolocation.longitude),
          accuracy: Number(config.geolocation.accuracy)
        },
        permissions: ['geolocation']
      } : {})
    });

    const page = await context.newPage();
    await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded' });

    if (hasAuth && !(await isLoginPage(page, config))) {
      console.log(`已加载登录状态：${authPath}`);
      console.log(`当前页面：${page.url()}`);
      if (shouldSign) {
        await signAttendance(page, config);
      }
      await waitWhenKeepingOpen(config);
      return;
    }

    if (hasAuth) {
      console.log('登录状态可能已失效，正在重新登录。');
    }

    await login(page, config);
    await waitForLoginToComplete(page, config);
    await context.storageState({ path: authPath });
    console.log(`登录状态已保存：${authPath}`);
    if (shouldSign) {
      await signAttendance(page, config);
    }
    await waitWhenKeepingOpen(config);
  } finally {
    await browser.close();
  }
}

async function loadConfig() {
  const configPath = path.resolve(rootDir, 'config.json');
  let config = DEFAULT_CONFIG;

  if (existsSync(configPath)) {
    const raw = await fs.readFile(configPath, 'utf8');
    const userConfig = JSON.parse(raw);
    config = deepMerge(DEFAULT_CONFIG, userConfig);
  }

  if (args.has('--auto')) {
    config = deepMerge(config, {
      interactive: false,
      keepOpen: false,
      captcha: {
        manualFallback: false
      }
    });
  }

  return config;
}

function deepMerge(base, override) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      merged[key] = deepMerge(base[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

async function login(page, config) {
  const rl = config.interactive ? readline.createInterface({ input, output }) : null;

  try {
    const username = await getCredential({
      envName: 'GZSUMS_USERNAME',
      configValue: config.username,
      rl,
      question: '请输入账号：',
      label: '账号'
    });
    const password = await getCredential({
      envName: 'GZSUMS_PASSWORD',
      configValue: config.password,
      rl,
      question: '请输入密码：',
      label: '密码'
    });

    await fillFirstVisible(page, config.selectors.username, username, '账号输入框');
    await fillFirstVisible(page, config.selectors.password, password, '密码输入框');

    const captchaCode = await solveCaptcha(page, config, rl);
    if (captchaCode) {
      await fillFirstVisible(page, config.selectors.captchaInput, captchaCode, '验证码输入框');
    }

    await submitLogin(page, config);
  } finally {
    rl?.close();
  }
}

async function getCredential({ envName, configValue, rl, question, label }) {
  const value = process.env[envName] || configValue;
  if (value) {
    return value;
  }

  if (rl) {
    return await rl.question(question);
  }

  throw new Error(`自动模式缺少${label}。请在 config.json 填写，或设置环境变量 ${envName}。`);
}

async function isLoginPage(page, config) {
  const passwordInput = page.locator(config.selectors.password).first();
  return await passwordInput.isVisible({ timeout: 3000 }).catch(() => false);
}

async function waitWhenKeepingOpen(config) {
  if (!config.keepOpen || !config.interactive) {
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    await rl.question('浏览器已保持打开。按回车结束脚本并关闭浏览器。');
  } finally {
    rl.close();
  }
}

async function solveCaptcha(page, config, rl) {
  const captchaElement = await findFirstVisible(page, config.selectors.captchaImage);
  if (!captchaElement) {
    if (config.captcha.manualFallback && rl) {
      return await rl.question('未自动定位验证码图片，请输入验证码：');
    }
    throw new Error('未自动定位验证码图片。请在 config.json 调整 selectors.captchaImage。');
  }

  const captchaPath = path.resolve(rootDir, 'captcha.png');
  const maxAttempts = Math.max(1, Number(config.captcha.maxAttempts) || 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await captchaElement.screenshot({ path: captchaPath });
    console.log(`验证码图片已保存：${captchaPath}`);

    if (!config.captcha.ocr) {
      break;
    }

    const processedPath = path.resolve(rootDir, 'captcha.processed.png');
    if (config.captcha.preprocess) {
      await preprocessCaptcha(page, captchaElement, processedPath);
    }

    const result = await recognizeCaptchaWithCandidates(
      config.captcha.preprocess ? [processedPath, captchaPath] : [captchaPath],
      config
    );
    if (isAcceptableCaptcha(result, config)) {
      console.log(`OCR 识别验证码：${result.text}，置信度：${Math.round(result.confidence)}，来源：${path.basename(result.source)}`);
      return result.text;
    }

    console.log(`第 ${attempt}/${maxAttempts} 次 OCR 不够可靠：${result.text || '空'}，置信度：${Math.round(result.confidence || 0)}`);
    if (attempt < maxAttempts) {
      await refreshCaptcha(page, captchaElement, config);
    }
  }

  if (config.captcha.manualFallback && rl) {
    return await rl.question('请查看 captcha.png 后输入验证码：');
  }

  throw new Error('验证码自动识别失败。可调低 captcha.minConfidence、增加 captcha.maxAttempts，或临时使用 npm run login 手动输入。');
}

async function refreshCaptcha(page, captchaElement, config) {
  const refreshSelector = config.captcha.refreshSelector;
  if (refreshSelector) {
    const refreshButton = await findFirstVisible(page, refreshSelector);
    if (refreshButton) {
      await refreshButton.click();
      await page.waitForTimeout(700);
      return;
    }
  }

  await captchaElement.click().catch(() => {});
  await page.waitForTimeout(700);
}

async function preprocessCaptcha(page, captchaElement, outputPath) {
  const dataUrl = await captchaElement.evaluate((element) => {
    const source = element;
    const rect = source.getBoundingClientRect();
    const scale = 5;
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const colorSpread = max - min;
      const brightness = (red + green + blue) / 3;
      const foreground = colorSpread > 24 || brightness < 105;
      const value = foreground ? 0 : 255;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }

    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  });

  await fs.writeFile(outputPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

async function recognizeCaptchaWithCandidates(imagePaths, config) {
  const worker = await createWorker('eng');
  try {
    const whitelist = config.captcha.characters === 'numeric'
      ? '0123456789'
      : '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    await worker.setParameters({
      tessedit_char_whitelist: whitelist,
      tessedit_pageseg_mode: '8',
      classify_bln_numeric_mode: config.captcha.characters === 'numeric' ? '1' : '0'
    });

    const results = [];
    for (const imagePath of imagePaths) {
      const { data } = await worker.recognize(imagePath);
      results.push({
        text: cleanCaptchaText(data.text, config),
        confidence: data.confidence ?? 0,
        source: imagePath
      });
    }

    return results.sort((left, right) => scoreCaptcha(right, config) - scoreCaptcha(left, config))[0];
  } finally {
    await worker.terminate();
  }
}

function cleanCaptchaText(value, config) {
  let text = value
    .replace(/[oO]/g, '0')
    .replace(/[iIl|]/g, '1')
    .replace(/[sS]/g, '5')
    .replace(/[bB]/g, '8')
    .replace(/[qQgG]/g, '9');

  if (config.captcha.characters === 'numeric') {
    return text.replace(/[^0-9]/g, '').trim();
  }

  return text.replace(/[^0-9a-z]/gi, '').trim();
}

function isAcceptableCaptcha(result, config) {
  if (!result?.text) {
    return false;
  }

  if (config.captcha.expectedLength && result.text.length !== config.captcha.expectedLength) {
    return false;
  }

  return result.confidence >= config.captcha.minConfidence || result.text.length === config.captcha.expectedLength;
}

function scoreCaptcha(result, config) {
  if (!result?.text) {
    return -1000;
  }

  const expectedLength = Number(config.captcha.expectedLength) || 0;
  const lengthScore = expectedLength && result.text.length === expectedLength ? 100 : -Math.abs(result.text.length - expectedLength) * 25;
  return lengthScore + (result.confidence || 0);
}

async function fillFirstVisible(page, selector, value, label) {
  const locator = await waitForFirstVisible(page, selector, 15000);
  await locator.fill(value);
  console.log(`已填写${label}`);
  return locator;
}

async function clickFirstVisible(page, selector, label) {
  const locator = await waitForFirstVisible(page, selector, 15000);
  await locator.click();
  console.log(`已点击${label}`);
}

async function submitLogin(page, config) {
  const submitButton = await findFirstVisible(page, config.selectors.submit);
  if (submitButton) {
    await submitButton.click({ force: true });
    console.log('已点击登录按钮');
    if (await waitForLoginPageToDisappear(page, config, 5000)) {
      return;
    }
  }

  const exactButton = await findFirstVisibleLocator(page, [
    page.getByRole('button', { name: /^登录$/ }),
    page.getByText(/^登录$/, { exact: true })
  ]);
  if (exactButton) {
    await exactButton.click({ force: true });
    console.log('已点击精确匹配的登录按钮');
    if (await waitForLoginPageToDisappear(page, config, 5000)) {
      return;
    }
  }

  if (await clickLoginByDom(page)) {
    console.log('已通过页面脚本触发登录按钮');
    if (await waitForLoginPageToDisappear(page, config, 5000)) {
      return;
    }
  }

  const captchaInput = await findFirstVisible(page, config.selectors.captchaInput);
  if (captchaInput) {
    await captchaInput.press('Enter');
    console.log('未找到可见登录按钮，已在验证码输入框按回车提交');
    if (await waitForLoginPageToDisappear(page, config, 5000)) {
      return;
    }
  }

  const passwordInput = await findFirstVisible(page, config.selectors.password);
  if (passwordInput) {
    await passwordInput.press('Enter');
    console.log('未找到可见登录按钮，已在密码输入框按回车提交');
    if (await waitForLoginPageToDisappear(page, config, 5000)) {
      return;
    }
  }

  throw new Error('已经尝试点击登录按钮，但页面仍停留在登录页。请检查按钮选择器或页面是否提示账号/密码错误。');
}

async function waitForLoginToComplete(page, config) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  if (!(await isLoginPage(page, config))) {
    return;
  }

  const debugPath = path.resolve(rootDir, 'login-after-submit.png');
  await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
  throw new Error(`提交后仍停留在登录页，已保存截图：${debugPath}`);
}

async function waitForLoginPageToDisappear(page, config, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await page.waitForLoadState('domcontentloaded', { timeout: 1000 }).catch(() => {});
    if (!(await isLoginPage(page, config))) {
      return true;
    }
    await page.waitForTimeout(300);
  }

  return false;
}

async function findFirstVisibleLocator(page, locators) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
  }
  return null;
}

async function clickLoginByDom(page) {
  return await page.evaluate(() => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    };

    const getText = (element) => {
      if (element instanceof HTMLInputElement) {
        return element.value || element.getAttribute('value') || '';
      }
      return element.textContent || '';
    };

    const candidates = Array.from(document.querySelectorAll('button,input,a,div,span'))
      .filter((element) => isVisible(element) && getText(element).trim() === '登录')
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
      });

    const target = candidates[0];
    if (!target) {
      const forms = Array.from(document.forms);
      const form = forms.find((item) => isVisible(item));
      if (form) {
        form.requestSubmit?.();
        return true;
      }
      return false;
    }

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    target.click();
    return true;
  });
}

async function signAttendance(page, config) {
  const period = getAttendancePeriod(config);
  if (!period) {
    console.log('当前时间不在签到窗口内，不执行签到。');
    return;
  }

  installDialogAutoAccept(page);

  await openAttendancePage(page, config);
  await verifyBrowserGeolocation(page, config);
  await clickAttendanceButton(page, config, period);
}

async function openAttendancePage(page, config) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  if (page.url().includes(config.attendance.url)) {
    console.log('已在实习签到页面。');
    return;
  }

  const entry = await findFirstVisibleLocator(page, [
    page.getByText(config.attendance.entryText, { exact: true }),
    page.locator(`a:has-text("${config.attendance.entryText}")`)
  ]);

  if (entry) {
    await entry.click({ force: true });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    console.log('已打开实习签到。');
    return;
  }

  const attendanceUrl = new URL(config.attendance.url, config.baseUrl).toString();
  await page.goto(attendanceUrl, { waitUntil: 'domcontentloaded' });
  console.log(`未在首页定位到入口，已直接打开：${attendanceUrl}`);
}

async function clickAttendanceButton(page, config, period) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

  const row = await findAttendanceRow(page, period.label);
  if (!row) {
    const debugPath = path.resolve(rootDir, 'attendance-page.png');
    await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
    throw new Error(`没有找到${period.label}签到行，已保存截图：${debugPath}`);
  }

  if (await rowHasSuccessStatus(row, config)) {
    console.log(`${period.label}签到已经提交，无需重复点击。`);
    await saveAttendanceScreenshot(page, config);
    return;
  }

  const signButton = await findFirstVisibleLocator(page, [
    row.getByRole('button', { name: /签到/ }),
    row.getByText(/^签到$/, { exact: true }),
    row.locator('button:has-text("签到"), a:has-text("签到"), input[value="签到"], div:has-text("签到"), span:has-text("签到")')
  ]);

  if (!signButton) {
    const debugPath = path.resolve(rootDir, 'attendance-no-button.png');
    await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
    throw new Error(`${period.label}行没有可点击的签到按钮，已保存截图：${debugPath}`);
  }

  if (args.has('--dry-run')) {
    await signButton.scrollIntoViewIfNeeded().catch(() => {});
    const dryRunPath = path.resolve(rootDir, 'attendance-dry-run.png');
    await page.screenshot({ path: dryRunPath, fullPage: true }).catch(() => {});
    console.log(`演练模式：已定位${period.label}签到按钮，但未点击。截图已保存：${dryRunPath}`);
    return;
  }

  await signButton.scrollIntoViewIfNeeded().catch(() => {});
  await signButton.click({ force: true });
  console.log(`已点击${period.label}签到。`);
  await settleAttendanceSubmit(page, config);

  const updatedRow = await findAttendanceRow(page, period.label);
  if (updatedRow && await rowHasSuccessStatus(updatedRow, config)) {
    console.log(`${period.label}签到已提交。`);
  } else {
    console.log(`${period.label}签到动作已执行，但未识别到完成状态，请查看结果截图。`);
  }
  await saveAttendanceScreenshot(page, config);
}

async function settleAttendanceSubmit(page, config) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (config.attendance.autoConfirm) {
      await clickOptionalConfirm(page);
    }
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(500);

    const bodyText = await page.locator('body').innerText({ timeout: 2000 }).catch(() => '');
    if (config.attendance.successTexts.some((text) => bodyText.includes(text))) {
      return;
    }
  }
}

async function rowHasSuccessStatus(row, config) {
  const text = await row.innerText().catch(() => '');
  return config.attendance.successTexts.some((successText) => text.includes(successText));
}

async function findAttendanceRow(page, periodLabel) {
  const rows = page.locator('tr');
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const text = await row.innerText().catch(() => '');
    if (text.includes(periodLabel)) {
      return row;
    }
  }
  return null;
}

async function clickOptionalConfirm(page) {
  const confirmButton = await findFirstVisibleLocator(page, [
    page.getByRole('button', { name: /^(确定|确认|好|允许)$/ }),
    page.getByText(/^(确定|确认|好|允许)$/, { exact: true }),
    page.locator('button:has-text("确定"), button:has-text("确认"), button:has-text("允许"), a:has-text("确定"), a:has-text("确认"), a:has-text("允许")')
  ]);

  if (confirmButton) {
    await confirmButton.click({ force: true });
    console.log('已确认页面弹窗。');
  }
}

function installDialogAutoAccept(page) {
  page.on('dialog', async (dialog) => {
    console.log(`页面弹窗：${dialog.message()}`);
    await dialog.accept().catch(() => {});
  });
}

async function verifyBrowserGeolocation(page, config) {
  if (!config.geolocation.enabled) {
    return;
  }

  const location = await page.evaluate(() => new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  })).catch(() => null);

  if (location) {
    console.log(`浏览器定位：${location.latitude}, ${location.longitude}，精度 ${Math.round(location.accuracy)} 米`);
  } else {
    console.log('未能从页面读取浏览器定位，继续尝试签到。');
  }
}

async function saveAttendanceScreenshot(page, config) {
  const screenshotPath = path.resolve(rootDir, config.attendance.resultScreenshot);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  console.log(`签到结果截图已保存：${screenshotPath}`);
}

function getAttendancePeriod(config) {
  const forcedPeriod = getArgValue('--period');
  if (forcedPeriod) {
    return normalizePeriod(forcedPeriod, config);
  }

  const minutes = getShanghaiMinutes();
  const morning = config.attendance.morning;
  const afternoon = config.attendance.afternoon;

  if (isWithinWindow(minutes, morning.start, morning.end)) {
    return { key: 'morning', ...morning };
  }

  if (isWithinWindow(minutes, afternoon.start, afternoon.end)) {
    return { key: 'afternoon', ...afternoon };
  }

  return null;
}

function normalizePeriod(value, config) {
  const normalized = value.toLowerCase();
  if (['am', 'morning', '上午'].includes(normalized)) {
    return { key: 'morning', ...config.attendance.morning };
  }
  if (['pm', 'afternoon', '下午'].includes(normalized)) {
    return { key: 'afternoon', ...config.attendance.afternoon };
  }
  throw new Error(`未知签到时间段：${value}。可用 --period=morning 或 --period=afternoon。`);
}

function getShanghaiMinutes() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function isWithinWindow(minutes, start, end) {
  return minutes >= parseClock(start) && minutes <= parseClock(end);
}

function parseClock(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

async function waitForFirstVisible(page, selector, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const locator = await findFirstVisible(page, selector);
    if (locator) {
      return locator;
    }
    await page.waitForTimeout(250);
  }

  throw new Error(`等待可见元素超时：${selector}`);
}

async function findFirstVisible(page, selector) {
  const candidates = page.locator(selector);
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }
  return null;
}

main().catch((error) => {
  if (error?.code === 'ABORT_ERR') {
    console.error('已取消。');
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
