create scene name=Game first=true
create object name=Player type=ShapePainter shape=rectangle color=#4488FF width=32 height=48 scene=Game
create object name=Ground type=ShapePainter shape=rectangle color=#8B4513 width=800 height=20 scene=Game
create object name=Platform type=ShapePainter shape=rectangle color=#8B4513 width=100 height=16 scene=Game
create object name=Coin type=ShapePainter shape=circle color=#FFD700 width=16 height=16 scene=Game
create object name=Enemy type=ShapePainter shape=rectangle color=#DC3232 width=32 height=32 scene=Game
add behavior type=PlatformBehavior::PlatformerObjectBehavior to=Player scene=Game
set variable name=Score value=0 type=Number scope=global
place object=Player at=100,400 scene=Game
place object=Ground at=400,590 scene=Game width=800 height=20
place object=Platform at=200,460 scene=Game width=100 height=16
place object=Platform at=400,380 scene=Game width=100 height=16
place object=Platform at=600,300 scene=Game width=100 height=16
place object=Coin at=240,430 scene=Game
place object=Coin at=440,350 scene=Game
place object=Coin at=640,270 scene=Game
place object=Enemy at=550,400 scene=Game
on start -> Score=0
on collision Player Coin -> destroy Coin, score+1
on collision Player Enemy -> restart
on key Space -> jump Player 500
