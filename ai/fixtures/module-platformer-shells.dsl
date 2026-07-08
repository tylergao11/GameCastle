install module id=core.platformer preset=basic sync=lockstep authority=host tickRate=20 seed=auto
install module id=shell.start_screen preset=basic sync=local authority=client title="Sky Runner" button="Start"
install module id=shell.game_over_screen preset=basic sync=event authority=host title="Game Over" hint="Press Space"
