Roadline VR — Models folder
===========================

Put this folder beside index.html in the root of your GitHub repository.

Connected GLB models (filenames must match exactly):
- car.glb — Cybertruck exterior model. The local cockpit/interior remains separate; remote players see this exterior.
- npc.glb — uploaded low-poly person used for pedestrians/NPCs.
- p365.glb — pistol model for the gun and gas-station pickup.
- beer_can.glb — your uploaded soda-can model used for the passenger-seat drink. The filename is kept as beer_can.glb to match the game's item slot.

Optional model slots (not included unless you add them):
house.glb, building.glb, gas_station.glb, restaurant.glb, bank.glb, tree.glb, bush.glb, rock.glb, fallen_log.glb, fence.glb, street_light.glb, road_sign.glb, traffic_car.glb, rocket_launcher.glb, monster.glb, maze_wall.glb, flashlight.glb, cash_bundle.glb, mailbox.glb, bench.glb, trash_can.glb, fire_hydrant.glb, road_barrier.glb.

Fallback behavior:
If a model file is missing, fails to load, or GLTFLoader is unavailable, the game keeps its built-in HTML/Three.js model.
