# macOS 本地网页辅助脚本

基于 Node.js + Playwright，用手机端视口打开：

`http://my.gzsums.net:1198/wap/index`

支持：

- 手机端 viewport
- 保存并复用登录状态 `auth.json`
- 自动填写账号、密码和图形验证码
- 自动截图识别图形验证码，识别失败时可自动刷新重试
- 通过 `config.json` 调整登录框、验证码、按钮选择器

## 安装

```bash
npm install
npx playwright install chromium
```

## 配置

```bash
cp config.example.json config.json
```

可以把账号密码写入 `config.json`，也可以用环境变量：

```bash
GZSUMS_USERNAME=你的账号 GZSUMS_PASSWORD=你的密码 npm run login
```

## 使用

首次登录并保存状态：

```bash
npm run login
```

全自动登录并保存状态：

```bash
npm run auto
```

后续复用 `auth.json`：

```bash
npm start
```

复用登录状态并执行实习签到：

```bash
npm run sign
```

重新登录并执行实习签到：

```bash
npm run auto-sign
```

清空登录态：

```bash
npm run reset-auth
```

## 说明

验证码图片会保存为 `captcha.png`。脚本会先用 OCR 识别。

`npm run login` 是交互模式：账号、密码或验证码缺失时会提示输入。

`npm run auto` 是全自动模式：账号、密码必须提前写进 `config.json` 或环境变量；验证码识别失败会按 `captcha.maxAttempts` 自动重试，不会停下来询问。

如果页面字段名称不同，请修改 `config.json` 里的 `selectors`。

## 实习签到

`npm run sign` 会进入“实习签到”页面，并根据当前上海时间选择对应行：

- 上午：05:00-08:00
- 下午：13:00-14:30

不在以上时间窗口内时，脚本只提示，不会点击。

测试时可以手动指定时间段：

```bash
node src/index.js --sign --period=morning
node src/index.js --sign --period=afternoon
```

如果验证码点击图片本身不会刷新，可以把刷新按钮选择器填到：

```json
{
  "captcha": {
    "refreshSelector": ".refresh-captcha"
  }
}
```
