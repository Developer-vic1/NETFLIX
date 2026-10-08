# QR Code generator

`qrcodegen.py` is the unmodified, dependency-free Python implementation from
Project Nayuki's QR Code generator. It is used only by the local Wi-Fi sharing
script to generate SVG codes on the computer. No pairing data is sent to an
external service and no `pip install` is required.

- Upstream: https://www.nayuki.io/page/qr-code-generator-library
- Source: https://github.com/nayuki/QR-Code-generator/blob/master/python/qrcodegen.py
- Retrieved: 2026-10-08
- SHA-256: `9f4ed1dd201dcb92b1bc0d6e14f46c754bcff0ce48580c5d7e8ace8f6926c8ef`
- License: MIT; the complete copyright and license notice is retained in the
  source header and copied to `qrcodegen.LICENSE.txt`.

Generated codes and the current pairing code are written only to the ignored
`output/wifi-connection/` folder. Never commit or publish that generated page.
