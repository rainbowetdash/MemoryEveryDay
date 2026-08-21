import SwiftUI
import UserNotifications

extension Notification.Name {
    static let memoryEveryDayTestNotificationPresented = Notification.Name("MemoryEveryDayTestNotificationPresented")
}

final class MemoryEveryDayAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
        if notification.request.identifier.hasPrefix("memoryeveryday-test-") {
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .memoryEveryDayTestNotificationPresented, object: nil)
            }
        }
    }
}

@main
struct MemoryEveryDayApp: App {
    @UIApplicationDelegateAdaptor(MemoryEveryDayAppDelegate.self) private var appDelegate
    @State private var isLoading = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                NativeWebView(isLoading: $isLoading)
                    .ignoresSafeArea()
                if isLoading { AppSplashView() }
            }
        }
    }
}

private struct AppSplashView: View {
    private let icon = UIImage(contentsOfFile: Bundle.main.path(forResource: "wecom-daily-memo-icon", ofType: "png") ?? "") ?? UIImage()

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color(red: 0.96, green: 0.98, blue: 0.99)
                VStack(spacing: 15) {
                    Image(uiImage: icon)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 88, height: 88)
                        .clipShape(RoundedRectangle(cornerRadius: 21, style: .continuous))
                        .shadow(color: Color(red: 0.08, green: 0.35, blue: 0.55).opacity(0.16), radius: 12, y: 6)
                    Text("每日备忘")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundStyle(Color(red: 0.09, green: 0.24, blue: 0.36))
                }
                .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
            }
        }
        .ignoresSafeArea()
    }
}
