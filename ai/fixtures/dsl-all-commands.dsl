# Comprehensive: all command types in one run
create scene name=Game first=true
create object name=Player type=ShapePainter shape=rectangle color=#4488FF width=32 height=48 scene=Game
create object name=ScoreLabel type=Text text="Score: 0" size=20 color=#FFFFFF scene=Game
add behavior type=PlatformBehavior::PlatformerObjectBehavior to=Player scene=Game
set variable name=Score value=0 type=Number
place object=Player at=100,400 scene=Game
set object name=Player color=#FF8844 scene=Game
add event desc="on start -> Score=0"
add event desc="on collision Player Enemy -> restart"
add event desc="on key Space -> jump Player 500"
add layer name=HUD scene=Game
set placement object=Player x=200 y=350 scene=Game
