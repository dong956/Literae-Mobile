# Literae Mobile

Literae Mobile is the lightweight, privacy-first companion to the Literae desktop library. It lets researchers carry OCR text and bibliographic metadata on a phone or tablet for offline reading and search.

## Features

- **Offline PWA:** install from Safari or Chrome and use it without an app store.
- **Private local storage:** imported data stays in IndexedDB in the selected browser; no library text is uploaded to a server.
- **Bookshelf and filters:** browse titles by category and tag.
- **Search inside one document:** find a term within the selected book and jump directly to a matching page.
- **Library-wide search:** search every imported document with grouped matches per title and standard sorting (matches count, latest, title, publish year).
- **Readable themes:** paper, soft white, and dark reading modes with adjustable text size.
- **Citation copy:** copy a short quotation with title, author, year, and page information.
- **Native projects included:** SwiftUI source for Xcode and a Swift Playgrounds package for iPad.

## Open the Web App

[Launch Literae Mobile](https://dong956.github.io/Literae-Mobile/)

### Install on iPhone or iPad with Safari

1. Open Literae Mobile in Safari.
2. Tap **Share**. If Safari first shows **More**, tap it and then tap **Share**.
3. Scroll down and choose **Add to Home Screen**. If the option is missing, scroll to the bottom, tap **Edit Actions**, and add it.
4. Enable **Open as Web App**, then tap **Add**.
5. Open Literae Mobile from the black **L** icon on the Home Screen.

### Install on iPhone or iPad with Chrome

1. Open Literae Mobile in Chrome.
2. Tap the **Share** button beside the address bar.
3. Choose **Add to Home Screen**, confirm the name, and tap **Add**.

### Install on Android with Chrome

1. Open Literae Mobile in Chrome.
2. Tap the three-dot menu beside the address bar.
3. Choose **Add to Home screen** and then **Install**. Some Chrome versions show **Install app** directly.

## Import a Library

1. In Literae desktop, open **Settings → Mobile**.
2. Select **Generate Package**, wait for completion, and download `Literae-Mobile-*.zip`.
3. Transfer the ZIP to the phone or tablet. Do not extract it.
4. Open Literae Mobile from the Home Screen, select **Choose Package**, and pick the ZIP.

Keep the original ZIP. Clearing browser data, changing browsers, or uninstalling the web app can remove the locally imported library.

## Swift Playgrounds on iPad

1. Install Apple's Swift Playgrounds.
2. AirDrop `LiteraeMobile.swiftpm` to the iPad and open it in Swift Playgrounds.
3. Tap **Run**.

## Repository Layout

```text
docs/                    GitHub Pages deployment copy of the PWA
web/                     PWA source and service worker
ios/                     SwiftUI Xcode project
LiteraeMobile.swiftpm/   Swift Playgrounds application package
AGENT_HANDOFF.md         Architecture and maintenance handoff
```

## Privacy Boundary

The mobile package contains bibliographic metadata and OCR text only. It excludes source PDFs, page images, absolute filesystem paths, API keys, settings, and logs.

## License

Literae Mobile is released under the [MIT License](LICENSE).
