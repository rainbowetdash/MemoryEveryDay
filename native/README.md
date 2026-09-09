# 每日备忘原生壳

`ios/` 和 `android/` 都以 `https://memoryeveryday.pages.dev` 为唯一内容源。iOS 原生壳仅在 App 启动时清除网页静态缓存与旧 Service Worker，并附带新的 `reload` 参数重新请求页面；普通切到后台再返回会保留当前页面和编辑状态，登录等本地数据不会被清除。

用 Android Studio 打开 `android/` 后即可构建调试安装包，输出路径为 `android/app/build/outputs/apk/debug/app-debug.apk`。

iOS 工程可以用 Xcode 打开 `ios/MemoryEveryDay.xcodeproj`。在真机导出 IPA 前，需要在 Xcode 的 Signing & Capabilities 中选择已登录 Apple ID 对应的 Personal Team。

每次发布新版 IPA 或 APK 后，将安装包放入网站根目录的 `downloads/` 版本化路径，并同步更新根目录的 `release-info.json`。网页下载入口和 App 内的更新提醒都以该发布信息为准。

## iPhone 月历小组件（1.0.16）

- 固定系统大号（systemLarge），左侧月历、右侧今日安排，蓝白配色。手机型号决定实际尺寸；不提供拖动改期，点击进入应用。
- 在 SideStore 更新 IPA 时保留 App Extensions（应用扩展）。更新后先打开每日备忘并登录，再长按主屏幕空白处 → 编辑 → 添加小组件 → 每日备忘。
- 主应用把日程标题、时间、颜色和完成状态处理后的展示内容写入共享容器，不传递登录令牌、语音密钥、备忘正文或账号邮箱。退出账号清空展示数据。更改安排或从后台返回时更新；小组件不独立登录云端，刷新受 iOS 调度，底部显示数据更新时间。
- 首次快照覆盖当月月历首格起的 98 天，重复安排复用网页日期规则；超出覆盖范围提示打开应用更新。日程结束后隐藏月历圆点，待办只有手动完成后移除。右侧最多展示三项，更多内容在应用内查看。
- 主应用及扩展使用 `group.com.memoryeveryday.app`。兼容 SideStore / AltStore 在 `ALTAppGroups` 中写入的重签名后组标识。真机需要保留扩展且两者具有匹配的 App Group 权限；模拟器通过不代表 SideStore 真机签名已经验证。
- `project.yml` 是项目来源，修改目标配置后运行 xcodegen 重新生成 Xcode 工程。IPA 包含 `Payload/MemoryEveryDay.app/PlugIns/MemoryEveryDayWidget.appex`，由 SideStore 在安装时签名。
