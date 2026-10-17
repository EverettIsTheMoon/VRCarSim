# Five Nights at Freddy's — WebXR Night Shift

A browser-based 3D horror game built for WebXR. Four animatronics spawn in separate parts of the restaurant and patrol waypoint routes. They periodically visit their assigned security door. If a monster waits at an open door for 10 seconds, the night ends. Closing that shutter makes it retreat.

## Play
Open the game from the VR Games library. On a WebXR-capable headset, choose **START IN VR**. GitHub Pages serves it over HTTPS. Three.js loads from jsDelivr, so the headset needs internet access.

## VR controls — left controller only
- **Left thumbstick:** move relative to the direction you're looking.
- **Point at a control + left trigger/select:** activate it.
- **DOOR:** toggle the matching security shutter. Close it while an animatronic waits outside.
- **HALL LIGHT:** toggle the matching corridor light.
- **Head movement:** look around; the head-mounted flashlight follows your view.
- Right-hand inputs are intentionally ignored.

## Desktop fallback
- **W A S D** or arrow keys: move.
- Click the game view and move the mouse to look around.
- Click a security control, or aim at it and press **E**.
- **1 / 2:** toggle the left / right shutter.
- **Esc:** release pointer lock.

## Included
- A brighter, permanently lit security office and a head-mounted flashlight.
- Connected main hall, side corridors, dining room, kitchen, rear connector and stage.
- Freddy, Bonnie, Chica and an endoskeleton patrolling separate routes.
- Door visits with a 10-second open-door countdown, retreat when the correct shutter closes, and restart after a game over.
- Interactive security shutters and corridor lights; wall collisions and a visible game-over/restart panel.
- Low-light horror atmosphere with enough ambient fill to navigate the rooms.
