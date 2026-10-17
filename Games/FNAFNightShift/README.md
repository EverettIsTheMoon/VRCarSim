Five Nights at Freddy's — WebXR Night Shift Prototype

A browser-based, procedural 3D horror prototype built for testing left-controller locomotion and animatronic patrols. The animatronics roam the pizzeria but do not chase, attack, or kill the player in this build.

## Play
Open the game from the VR Games library. On a WebXR-capable headset, choose START IN VR. The site must be served over HTTPS (GitHub Pages is supported). Three.js loads from jsDelivr, so the headset needs internet access.

## VR controls — left controller only
- Left thumbstick: move relative to the direction you're looking.
- Point at a wall control + left trigger/select: activate it.
- DOOR: toggle the matching security shutter.
- HALL LIGHT: toggle the matching corridor light.
- Head movement: look around.
- Right-hand inputs are intentionally ignored.

## Desktop fallback
- W A S D or arrow keys: move.
- Click the game view and move the mouse to look around.
- Click a door panel to activate it, or aim at it and press E.
- 1 / 2: toggle the left / right shutter.
- Esc: release pointer lock.

## Included
- Security office, main hall, side corridors, dining room, kitchen, rear connector and stage.
- Four procedurally built animatronic characters patrolling waypoint routes.
- Interactive shutters and corridor lights.
- Dim lighting, flickering fluorescents, red emergency lights, low-volume synthesized ambience.
- Wall and closed-shutter collision.
- No chase / attack / death AI yet, intentionally.