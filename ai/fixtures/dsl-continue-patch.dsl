create object name=PowerUp type=ShapePainter shape=circle color=#00FF00 width=20 height=20 scene=Game
place object=PowerUp at=500,300 scene=Game
set variable name=Lives value=3 type=Number
add event desc="on collision Player PowerUp -> destroy PowerUp, Lives+1"
