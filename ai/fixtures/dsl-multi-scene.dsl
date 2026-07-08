create scene name=Menu first=true
create object name=Title type=Text text="Game Title" size=32 color=#FFFFFF scene=Menu
place object=Title at=400,100 scene=Menu
add event desc="on key Enter -> scene Game"
create scene name=Game
create object name=Player type=ShapePainter shape=rectangle color=#4488FF width=32 height=48 scene=Game
create object name=Ground type=ShapePainter shape=rectangle color=#8B4513 width=800 height=20 scene=Game
add behavior type=PlatformBehavior::PlatformBehavior to=Ground scene=Game
place object=Player at=100,400 scene=Game
place object=Ground at=400,590 scene=Game width=800 height=20
add event desc="on start -> Score=0"
