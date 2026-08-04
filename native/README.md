# 每日备忘原生壳

`ios/` 和 `android/` 都以 `https://memoryeveryday.pages.dev` 为唯一内容源。每次启动或从后台回到前台时，原生壳会清除网页静态缓存与旧 Service Worker，并附带新的 `reload` 参数重新请求页面；登录等本地数据不会被清除。

用 Android Studio 打开 `android/` 后即可构建调试安装包，输出路径为 `android/app/build/outputs/apk/debug/app-debug.apk`。

iOS 工程可以用 Xcode 打开 `ios/MemoryEveryDay.xcodeproj`。在真机导出 IPA 前，需要在 Xcode 的 Signing & Capabilities 中选择已登录 Apple ID 对应的 Personal Team。
