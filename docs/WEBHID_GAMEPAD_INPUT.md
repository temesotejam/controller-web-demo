# WebHID gamepad input

When DualSense Bluetooth enhanced reports (`0x31 / 77 bytes`) are active, WebHID is the authoritative input source for the controller UI.

WebHID payload offsets (report ID excluded):

- 1: left stick X
- 2: left stick Y
- 3: right stick X
- 4: right stick Y
- 5: L2 analog
- 6: R2 analog
- 8-10: buttons
- 33-36: touch point 0
- 37-40: touch point 1

The app keeps the Gamepad API as a fallback, but does not let the simulator overwrite recent WebHID input.
