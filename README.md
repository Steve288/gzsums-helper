# GZSUMS Helper

这是一个基于 Node.js、Playwright 和 Tesseract.js 的本地网页辅助脚本，用手机端视口打开目标网页，支持登录状态复用、验证码识别，以及在指定时间段执行实习签到。

目标网页需要能从运行脚本的电脑或服务器访问。GitHub Actions 这类云端运行环境通常访问不到内网或受限网站，不建议用来运行本项目。

## 上传到 GitHub 前

建议上传这些内容：

- `src/`
- `scripts/`
- `README.md`
- `config.example.json`
- `package.json`
- `package-lock.json`
- `.gitignore`
- `.gitattributes`

不要上传这些内容：

- `config.json`：可能包含账号、密码、定位坐标等个人配置。
- `auth.json`：浏览器登录态，里面有 Cookie 或 Token。
- `.env`、`.env.*`：常见的本地密钥文件。
- `node_modules/`：依赖目录，别人安装时会自动生成。
- `captcha*.png`、`attendance-*.png`、`login-after-submit.png` 等截图：可能包含姓名、学校、签到状态或验证码。
- `*.traineddata`、`encrypteddata`、`.DS_Store`：本地缓存或系统文件。

这些文件已经写进 `.gitignore`。如果你曾经把账号密码、Cookie、Token 或截图推到公开仓库，请先修改密码或让旧登录态失效，再清理 Git 历史。

如果发布到已有 GitHub 仓库，并且远端之前放过 `.github/workflows/auto-sign.yml`，建议删掉它。这个项目更适合在自己的电脑、宿舍/家里服务器、NAS、云主机或 Windows 任务计划中运行。

## 环境要求

- Node.js 20 或更高版本
- npm
- 能访问目标网页的网络环境
- 第一次安装 Playwright 浏览器时需要能访问下载源

检查 Node.js 版本：

```bash
node -v
```

## 安装

macOS / Linux：

```bash
git clone <你的仓库地址>
cd gzsums-mobile-helper
npm ci
npm run install-browsers
cp config.example.json config.json
```

Windows PowerShell：

```powershell
git clone <你的仓库地址>
cd gzsums-mobile-helper
npm ci
npm run install-browsers
Copy-Item config.example.json config.json
```

## 配置

打开本地的 `config.json`，填写自己的账号配置。这个文件只放在本机，不要提交到 GitHub。

常用配置：

- `username`、`password`：可以直接写入 `config.json`，也可以留空后用环境变量传入。
- `geolocation.enabled`：默认开启，并使用医院附近的示例坐标；如果签到地点不同，请改成自己的地点。
- `headless`：服务器运行通常设为 `true`，本地调试通常设为 `false`。
- `keepOpen`：本地调试可设为 `true`，自动运行建议设为 `false`。
- `selectors`：如果网页输入框或按钮识别不到，再调整这里的选择器。
- `captcha.maxAttempts`：验证码自动识别失败较多时，可以适当增加。

也可以不把账号密码写进 `config.json`，改用环境变量。

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

## 使用

首次登录并保存登录态：

```bash
npm run login
```

全自动登录并保存登录态：

```bash
npm run auto
```

后续复用 `auth.json` 打开网页：

```bash
npm start
```

复用登录态并执行实习签到：

```bash
npm run sign
```

重新登录并执行实习签到：

```bash
npm run auto-sign
```

只定位签到按钮、不真正点击：

```bash
npm run sign-dry-run
```

清空本地登录态：

```bash
npm run reset-auth
```

## 签到时间

默认按上海时间判断：

- 上午：05:00 到 08:00
- 下午：13:00 到 14:30

不在以上时间窗口内时，脚本只提示，不会点击。

测试时可以手动指定时间段：

```bash
node src/index.js --sign --period=morning
node src/index.js --sign --period=afternoon
```

## 部署方式

本地电脑最简单：保持项目目录不变，需要签到时运行 `npm run auto-sign`。

macOS / Linux 服务器可以用 `cron` 定时运行。先确认 `config.json` 里 `headless` 是 `true`、`keepOpen` 是 `false`，然后编辑定时任务：

```bash
crontab -e
```

示例：

```cron
1 7 * * * cd /path/to/gzsums-mobile-helper && npm run auto-sign >> sign.log 2>&1
31 13 * * * cd /path/to/gzsums-mobile-helper && npm run auto-sign >> sign.log 2>&1
```

Windows 可以用“任务计划程序”：

- 程序或脚本：`npm`
- 参数：`run auto-sign`
- 起始于：项目所在目录，例如 `C:\Users\you\gzsums-mobile-helper`
- 触发器：按你的签到时间设置上午和下午两条任务

如果服务器没有图形界面，请使用 `headless: true`。如果网页需要当前位置，确认 `geolocation.enabled`、经纬度和网络环境都正确。示例坐标只做了约 10 米偏移，实际使用前可以按自己的签到点微调。

## 常见问题

验证码识别失败：先用 `npm run login` 手动输入验证码；稳定后再尝试 `npm run auto` 或 `npm run auto-sign`。

找不到登录框或按钮：网页结构可能变了，需要调整 `config.json` 里的 `selectors`。

签到后没有识别到成功状态：检查生成的截图，并把网页实际显示的成功文字补到 `attendance.successTexts`。

目标网页打不开：先在同一台电脑或服务器的浏览器里确认能打开网页。云端平台无法访问时，换成本地电脑或能访问该网站的服务器运行。
