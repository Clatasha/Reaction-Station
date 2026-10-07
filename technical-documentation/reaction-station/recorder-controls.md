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


## Separate recorded audio (0.3.0)

Windows native recordings save enabled microphone and desktop sources independently as lossless WAV files next to the video. Both use the mixer's source clock, including silence and pause/resume, and respect live gain/mute changes. Muted samples are silence; raising the editor volume cannot recover sound muted during capture. The video retains its original combined sound as a fallback.

A new recording opens with **Microphone** and **Desktop audio** on separate timeline rows. Select a track to adjust gain, mute, fade in/out, move, trim, or slip its source offset. The editor suppresses the video's embedded sound only after every available source has been imported and the document saved. If import/probing fails, it keeps the embedded mix and reports the failure. Deleting/muting a separate track keeps that source silent; it does not restore the fallback mix.

Separate tracks persist as normal project audio assets and use the existing project relinking/export paths. They follow video trims and speed changes in preview and native export, without automatic loudness normalization or desktop ducking. Imported music and separately recorded voiceovers keep their previous behavior. Recording sources are exempt from the sequential voiceover placement rule and cannot be looped in the inspector.

This first capture implementation is **Windows native only**. Browser capture and native macOS/Linux recordings still store a combined mix. Old recordings cannot be split into independent sources after the fact. WAV tracks need roughly 660 MiB per hour per enabled source at 48 kHz stereo; keep them with the video/project. Long tracks use RF64 when RIFF's 4 GiB limit is exceeded.

Validation includes source-channel PCM isolation and shared-clock tests, portable WAV header tests, atomic import/fallback and project round-trip tests, trim/speed export serialization, and a real decoder/mixer/stretch Rust test. The Windows packaging workflow also imports synthetic source files through the packaged editor and saves an editor preview. Real microphone/desktop capture and OS interaction still require the manual desktop pass.
