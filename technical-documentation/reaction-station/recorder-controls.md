# Reaction Station recorder controls

The recorder has a branded two-row dock: session identity and status above the capture controls. Controls opens the audio mixer and recording hotkey settings. Horizontal and vertical docks keep their existing positioning and click-through behavior.

## Recording hotkeys

The recorder accepts these global shortcuts while it is open, including while another application has focus:

| Default | Action |
| --- | --- |
| Ctrl + Shift + R | Start / stop and save |
| Ctrl + Shift + P | Pause / resume |
| Ctrl + Shift + M | Mute / unmute microphone |
| Ctrl + Shift + S | Mute / unmute system audio |

On macOS, use Command instead of Ctrl. Change the combinations in Controls → Hotkeys between takes. Settings persist across app launches. Saving duplicate or occupied combinations keeps the previous bindings and settings. An occupied shortcut at startup is logged; other available shortcuts still register. Recording shortcuts are unregistered while the editor is open so they do not intercept editing or browser shortcuts; reopening the recorder restores the saved combinations.

## Live audio

Windows native capture and browser capture support independent voice and system-audio sliders and mute. Sliders run from 0–100% of the existing recording level; microphone gain staging remains unchanged at 100%. Mute preserves the slider value, and unmute restores it. The dock's microphone and speaker buttons become mute controls during a take.

Enable the desired audio sources before recording. Device selection and adding a source remain locked during a take. Muting keeps the capture source running, so it can be restored without interrupting or restarting the recording. Muting system audio changes the recorded sound, not the sound playing through your headphones.

The native macOS and Linux helpers do not yet support live gain commands; their live mixer controls are disabled. Newly added recorder copy uses English fallback text in non-English locales pending translation.

## Validation

Unit tests cover conflicting registrations, persistence failure, action swaps, input validation, pre-muted startup, live gain and mute restoration, and UI availability. The Windows packaging workflow compiles the changed helper, runs PCM output tests for live gain changes, and checks the packaged UI with Playwright, saving four interface previews.

Real Windows audio capture, a physical microphone, OS hotkeys while another app is focused, HUD click-through, and the capture-to-export flow must still be checked on the installed test build. Native computer control is unavailable in the current development environment; renderer automation does not establish these desktop checks.
