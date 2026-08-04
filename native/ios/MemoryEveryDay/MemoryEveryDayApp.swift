import SwiftUI

@main
struct MemoryEveryDayApp: App {
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
    var body: some View {
        ZStack {
            Color(red: 0.96, green: 0.98, blue: 0.99).ignoresSafeArea()
            VStack(spacing: 15) {
                Image("wecom-daily-memo-icon")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 88, height: 88)
                    .clipShape(RoundedRectangle(cornerRadius: 21, style: .continuous))
                    .shadow(color: Color(red: 0.08, green: 0.35, blue: 0.55).opacity(0.16), radius: 12, y: 6)
                Text("每日备忘")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundStyle(Color(red: 0.09, green: 0.24, blue: 0.36))
            }
        }
    }
}
