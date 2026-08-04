import SwiftUI

@main
struct MemoryEveryDayApp: App {
    var body: some Scene {
        WindowGroup {
            NativeWebView()
                .ignoresSafeArea()
        }
    }
}
