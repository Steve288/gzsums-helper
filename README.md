# GZSUMS Helper

GZSUMS Helper 是一个基于 **Node.js、Playwright 和 Tesseract.js** 的本地网页辅助脚本。

它会使用手机端浏览器视口打开目标网页，支持：

- 登录状态复用
- 验证码识别
- 在指定时间段执行实习签到
- 本地电脑、NAS、服务器定时运行

> 本项目需要在能访问目标网页的电脑或服务器上运行，GitHub Actions 这类云端运行环境可能无法访问网站。

---

## 一、适合谁使用？

如果你希望在自己的电脑、NAS、服务器或 Windows 任务计划中运行签到脚本，可以使用本项目。

普通使用者只需要：

1. 下载或 clone 本项目
2. 安装依赖
3. 复制并填写 `config.json`
4. 本地运行或设置定时任务

**不需要把项目重新上传到 GitHub。**

---

## 二、安全注意事项

本项目可能涉及账号、密码、登录态 Cookie、Token、定位坐标和签到截图等敏感信息。

请不要上传以下文件到 GitHub 或公开分享：

- `config.json`：可能包含账号、密码、定位坐标等个人配置
- `auth.json`：浏览器登录态，里面可能包含 Cookie 或 Token
- `.env`、`.env.*`：常见的本地密钥文件
- `node_modules/`：依赖目录，别人安装时会自动生成
- `captcha*.png`
- `attendance-*.png`
- `login-after-submit.png`
- 其他可能包含姓名、学校、签到状态或验证码的截图
- `*.traineddata`
- `encrypteddata`
- `.DS_Store`

这些文件已经写入 `.gitignore`，正常情况下不会被 Git 提交。

如果你曾经把账号密码、Cookie、Token 或截图推送到公开仓库，请尽快：

1. 修改密码，或让旧登录态失效
2. 删除公开仓库中的敏感文件
3. 必要时清理 Git 历史记录

---

## 三、环境要求

运行前请确认已经安装：

- Node.js 20 或更高版本
- npm
- 可以访问目标网页的网络环境
- 第一次安装 Playwright 浏览器时，需要能访问浏览器下载源

检查 Node.js 版本：

```bash
node -v
```

如果版本低于 20，建议先升级 Node.js。

---

## 四、安装方法

### macOS / Linux

```bash
git clone <你的仓库地址>
cd gzsums-mobile-helper
npm ci
npm run install-browsers
cp config.example.json config.json
```

### Windows PowerShell

```powershell
git clone <你的仓库地址>
cd gzsums-mobile-helper
npm ci
npm run install-browsers
Copy-Item config.example.json config.json
```

安装完成后，项目目录里应该会出现一个新的 `config.json` 文件。

---

## 五、配置方法

打开本地的 `config.json`，填写自己的账号和运行配置。

> `config.json` 只应该保存在自己的电脑或服务器上，不要提交到 GitHub。

### 1. 账号密码

可以直接写在 `config.json` 中：

```json
{
  "username": "你的账号",
  "password": "你的密码"
}
```

也可以留空，改用环境变量传入。

macOS / Linux：

```bash
GZSUMS_USERNAME=你的账号 GZSUMS_PASSWORD=你的密码 npm run login
```

Windows PowerShell：

```powershell
$env:GZSUMS_USERNAME="你的账号"
$env:GZSUMS_PASSWORD="你的密码"
npm run login
```

---

### 2. 常用配置说明

| 配置项 | 说明 |
|---|---|
| `username` | 登录账号 |
| `password` | 登录密码 |
| `geolocation.enabled` | 是否启用模拟定位 |
| `geolocation.latitude` | 纬度 |
| `geolocation.longitude` | 经度 |
| `headless` | 是否无界面运行 |
| `keepOpen` | 运行结束后是否保持浏览器打开 |
| `selectors` | 登录框、密码框、验证码、按钮等网页选择器 |
| `captcha.maxAttempts` | 验证码识别最大尝试次数 |

一般建议：

- 本地调试时：`headless: false`
- 自动运行时：`headless: true`
- 本地调试时：`keepOpen: true`
- 自动运行时：`keepOpen: false`

如果网页需要当前位置，请确认 `geolocation.enabled`、经纬度和网络环境都正确。

---

## 六、基本使用

### 1. 首次登录并保存登录态

```bash
npm run login
```

这个命令适合第一次使用。  
如果验证码识别失败，可以手动输入验证码。

登录成功后，会在本地生成 `auth.json`，用于保存登录状态。

---

### 2. 全自动登录并保存登录态

```bash
npm run auto
```

这个命令会尝试自动登录，包括自动识别验证码。

如果验证码识别不稳定，建议先使用：

```bash
npm run login
```

手动登录成功后，再尝试自动运行。

---

### 3. 复用登录态打开网页

```bash
npm start
```

这个命令会复用本地的 `auth.json` 打开网页。

---

### 4. 复用登录态并执行签到

```bash
npm run sign
```

适合已经登录过、且 `auth.json` 仍然有效的情况。

---

### 5. 重新登录并执行签到

```bash
npm run auto-sign
```

这是自动签到时最常用的命令。

它会尝试：

1. 自动登录
2. 保存登录态
3. 判断当前是否在签到时间段
4. 如果在时间段内，则执行签到

---

### 6. 只测试签到按钮，不真正点击

```bash
npm run sign-dry-run
```

这个命令适合调试。  
它会尝试定位签到按钮，但不会真正点击。

---

### 7. 清空本地登录态

```bash
npm run reset-auth
```

如果登录态失效、账号切换或页面异常，可以先清空 `auth.json`，再重新登录。

---

## 七、签到时间

默认按上海时间判断签到时间段。

| 时间段 | 默认范围 |
|---|---|
| 上午 | 05:00 - 08:00 |
| 下午 | 13:00 - 14:30 |

不在以上时间段内时，脚本只会提示当前不在签到时间窗口内，不会点击签到按钮。

测试时可以手动指定时间段：

```bash
node src/index.js --sign --period=morning
```

```bash
node src/index.js --sign --period=afternoon
```

---

## 八、部署方式

### 方式一：本地手动运行

最简单的方式是保留项目目录，需要签到时手动运行：

```bash
npm run auto-sign
```

---

### 方式二：macOS / Linux / NAS 使用 cron 定时运行

先确认 `config.json` 中：

```json
{
  "headless": true,
  "keepOpen": false
}
```

然后编辑定时任务：

```bash
crontab -e
```

示例：

```cron
1 7 * * * cd /path/to/gzsums-mobile-helper && npm run auto-sign >> sign.log 2>&1
31 13 * * * cd /path/to/gzsums-mobile-helper && npm run auto-sign >> sign.log 2>&1
```

含义：

- 每天 07:01 执行一次上午签到
- 每天 13:31 执行一次下午签到
- 日志写入 `sign.log`

请把 `/path/to/gzsums-mobile-helper` 改成你自己的项目路径。

---

### 方式三：Windows 任务计划程序

可以使用 Windows 自带的“任务计划程序”。

推荐设置：

| 项目 | 内容 |
|---|---|
| 程序或脚本 | `npm` |
| 参数 | `run auto-sign` |
| 起始于 | 项目所在目录，例如 `C:\Users\you\gzsums-mobile-helper` |
| 触发器 | 按签到时间设置上午和下午两条任务 |

---

## 九、常见问题

### 1. 验证码识别失败怎么办？

先使用手动登录：

```bash
npm run login
```

手动输入验证码并登录成功后，再尝试：

```bash
npm run auto
```

或：

```bash
npm run auto-sign
```

如果验证码经常识别失败，可以适当增加 `config.json` 中的：

```json
"captcha": {
  "maxAttempts": 5
}
```

---

### 2. 找不到登录框、密码框或按钮怎么办？

可能是网页结构发生了变化，需要调整 `config.json` 里的 `selectors`。

例如：

```json
"selectors": {
  "username": "input[name='username']",
  "password": "input[name='password']",
  "submit": "button[type='submit']"
}
```

可以先把 `headless` 改成 `false`，观察浏览器实际打开的页面，再修改选择器。

---

### 3. 签到后没有识别到成功状态怎么办？

先检查脚本生成的截图。

如果网页实际显示的成功文字没有写入配置，可以把对应文字补充到：

```json
"attendance": {
  "successTexts": [
    "签到成功",
    "打卡成功"
  ]
}
```

---

### 4. 目标网页打不开怎么办？

请先在同一台电脑或服务器的浏览器里手动打开目标网页。

如果浏览器也打不开，说明问题通常在网络环境，而不是脚本本身。

常见原因包括：

- 当前网络无法访问目标网站
- 网站只允许校园网、医院网或内网访问
- 云服务器或 GitHub Actions 无法访问该网站
- DNS 或代理配置异常

这种情况下，请换到能访问目标网页的电脑、NAS 或服务器上运行。

---

### 5. 服务器没有图形界面怎么办？

把 `config.json` 里的：

```json
"headless": true
```

并确认：

```json
"keepOpen": false
```

这样 Playwright 会以无界面模式运行。

---

### 6. 定位不准确怎么办？

如果网页需要当前位置，请检查：

- `geolocation.enabled` 是否为 `true`
- 经纬度是否正确
- 运行脚本的网络环境是否允许访问目标网页
- 浏览器是否成功授予定位权限

示例坐标只适合测试，实际使用前请改成自己的签到地点附近坐标。

---

## 十、推荐使用流程

第一次使用时，推荐按以下顺序操作：

```bash
npm ci
npm run install-browsers
cp config.example.json config.json
npm run login
npm run sign-dry-run
npm run auto-sign
```

确认可以正常运行后，再配置 `cron` 或 Windows 任务计划程序自动执行。

---

## 十一、项目文件说明

| 文件或目录 | 说明 |
|---|---|
| `src/` | 主要脚本代码 |
| `scripts/` | 辅助脚本 |
| `README.md` | 项目说明文档 |
| `config.example.json` | 示例配置文件，可以提交到 GitHub |
| `config.json` | 本地真实配置文件，不要提交 |
| `auth.json` | 本地登录态文件，不要提交 |
| `package.json` | 项目依赖和 npm 命令 |
| `package-lock.json` | 依赖版本锁定文件 |
| `.gitignore` | Git 忽略规则 |
| `.gitattributes` | Git 文件属性配置 |
