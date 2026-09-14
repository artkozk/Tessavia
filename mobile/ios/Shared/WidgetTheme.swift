import SwiftUI

enum TessavieTheme {
    static let green = Color(red: 18/255, green: 107/255, blue: 88/255)
    static func accent(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(red: 133/255, green: 217/255, blue: 190/255) : green
    }
    static func background(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(red: 25/255, green: 38/255, blue: 31/255) : Color(red: 244/255, green: 243/255, blue: 238/255)
    }
}
