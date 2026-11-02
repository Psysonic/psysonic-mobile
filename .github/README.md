<div align="center">

  <img src="../public/psysonic-inapp-logo.svg" alt="Psysonic Logo" width="320"/>

## Psysonic for iPhone, iPad and Android

**The Psysonic music player for your self-hosted library, on the phone and in the car.**

Built primarily for **Navidrome**, and working with other Subsonic-compatible servers.

<a href="https://discord.gg/AMnDRErm4u"><img src="https://img.shields.io/badge/Discord-Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord Community"></a> <a href="https://t.me/+GLBx1_xeH28xYTJi"><img src="https://img.shields.io/badge/Telegram-Community-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram Community"></a> <a href="https://ko-fi.com/psychotoxic"><img src="https://img.shields.io/badge/Ko--fi-Support%20Psysonic-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support Psysonic on Ko-fi"></a>

</div>

---

## Status

The mobile apps are in **beta**.

- **iOS / iPadOS:** join the [TestFlight beta](https://testflight.apple.com/join/WuYBtvWA).
- **Android:** closed test on Google Play. Join the [Psysonic Beta group](https://groups.google.com/g/psysonic-beta), then install through the [testing page](https://play.google.com/apps/testing/dev.psysonic.player).

## What the apps do

- Your library from your own server, with a touch interface made for the phone.
- **CarPlay** and **Android Auto**, with voice requests through **Siri** and the Google Assistant.
- Lock screen and media controls, playback in the background.
- Downloads up to the **whole library** for offline listening; on mobile data, downloads wait for Wi-Fi unless you allow them.

## How this repository relates to Psysonic

This repository follows [Psysonic](https://github.com/Psysonic/psysonic): Psysonic `main` is merged in regularly, so every desktop feature and fix reaches the phones. On top of that it carries the touch interface and the native iOS and Android code. The desktop app itself is developed and released in the [Psysonic repository](https://github.com/Psysonic/psysonic).

**Contributing:** changes that are not specific to the phones belong in [Psysonic](https://github.com/Psysonic/psysonic) and arrive here with the next merge. How the mobile code is organised, and what is deliberately different from the desktop, is described in [`MOBILE.md`](../MOBILE.md).

## License

GPL-3.0, like Psysonic. See [`LICENSE`](../LICENSE).
