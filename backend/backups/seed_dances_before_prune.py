"""Seed data for Stompin' Ground Yuma line dance library.
Curated worldwide selection with step sheet notes.
Format: (name, choreographer, choreographer_country, song, artist, difficulty,
         bpm, count, youtube_query, step_sheet).
Step sheets are compact reference notes — for full official notation,
visit the choreographer's site.
"""

SEED_DANCES = [
    # ---------- USA classics ----------
    ("Watermelon Crawl", "Sue Lipscomb", "USA", "Watermelon Crawl", "Tracy Byrd", "Beginner", 96, "32 count, 4 wall",
     "watermelon crawl line dance",
     "Intro: 16 counts.\n\n1-8 Grapevine right with heel touches, grapevine left with heel touches.\n9-16 Toe-heel struts forward right & left, kick-ball-change x2.\n17-24 Hip bumps R-R-L-L-R-L-R-L (the 'crawl').\n25-32 Step forward R, pivot ¼ turn L, walk back L-R-L, touch R next to L.\nBegin again."),

    ("Boot Scootin' Boogie", "Bill Bader", "USA", "Boot Scootin' Boogie", "Brooks & Dunn", "Beginner", 128, "32 count, 4 wall",
     "boot scootin boogie line dance",
     "1-8 Right heel forward, hook, heel forward, step. Repeat left.\n9-16 Vine right with clap, vine left with ¼ turn L clap.\n17-24 Rocking chair (rock forward R, recover L, rock back R, recover L).\n25-32 Stomp R, stomp L, hip bumps R-L-R-L.\nWall changes on the ¼ turn."),

    ("Electric Slide", "Ric Silver", "USA", "Electric Boogie", "Marcia Griffiths", "Beginner", 118, "18 count, 4 wall",
     "electric slide line dance",
     "1-4 Grapevine right, touch.\n5-8 Grapevine left, touch.\n9-12 Walk back R-L-R, touch L next to R.\n13-16 Step forward L, rock R, recover L, brush R.\n17-18 Step forward R with ¼ turn L, brush L.\nRestart facing new wall."),

    ("Cowboy Cha Cha", "Traditional", "USA", "Neon Moon", "Brooks & Dunn", "Beginner", 100, "Partner",
     "cowboy cha cha",
     "Partner dance in sweetheart position.\n1-4 Forward R L R, cha-cha-cha.\n5-8 Back L R L, cha-cha-cha.\n9-16 Two turning cha-cha sections; lady spins under lead's arm on beats 5 & 13."),

    ("Tush Push", "Jim Ferrazzano", "USA", "Tush Push", "Various", "Improver", 120, "40 count, 4 wall",
     "tush push line dance",
     "1-8 Heel switches R,L,R,L, then heel + hook + heel + step.\n9-16 Hip bumps forward 2 counts, back 2 counts, R-L-R-L rolling hips.\n17-24 Jazz box with ¼ turn, cross-shuffle right & left.\n25-32 Step ½ turn R, step ½ turn R, walk back L-R-L-touch.\n33-40 Charleston kicks and step-touches.\nStart again."),

    ("Cotton Eye Joe", "Traditional", "USA", "Cotton Eye Joe", "Rednex", "Beginner", 140, "16 count, 4 wall",
     "cotton eye joe line dance",
     "1-4 Heel R, cross R over L, heel R, step R next to L.\n5-8 Same on left.\n9-12 Shuffle forward R-L-R, shuffle L-R-L.\n13-16 Rock back R, recover L, shuffle in place ¼ turn L."),

    ("Copperhead Road", "Traditional", "USA", "Copperhead Road", "Steve Earle", "Improver", 138, "36 count, 4 wall",
     "copperhead road line dance",
     "Intro: 64 counts (wait for the bagpipes to fade).\n1-8 Grapevine right, stomp; grapevine left, stomp.\n9-16 Rock forward R, recover L, back R, recover L; two ½ pivot turns.\n17-24 Kick-ball-changes with stomps.\n25-36 Two shuffles forward, rock and step-turns closing to ¼ wall change."),

    ("Wagon Wheel Rock", "Michele Perron", "USA", "Wagon Wheel", "Darius Rucker", "Beginner", 148, "32 count, 4 wall",
     "wagon wheel rock line dance",
     "1-8 Toe struts R and L forward, rock-recover R.\n9-16 Shuffle back R-L-R, coaster step L, shuffle forward with ¼ turn L.\n17-24 Step, pivot ½, walk forward R-L, mambo step.\n25-32 Sway-sway, jazz box cross."),

    ("Cupid Shuffle", "Cupid", "USA", "Cupid Shuffle", "Cupid", "Beginner", 120, "32 count, 4 wall",
     "cupid shuffle line dance",
     "Called out in the song:\n1-8 Step right R-L-R-L-touch.\n9-16 Step left L-R-L-R-touch.\n17-24 Heel drops (kick-and-back) 8 counts.\n25-32 ¼ turn walking left 8 counts."),

    ("Cha Cha Slide", "DJ Casper", "USA", "Cha Cha Slide", "DJ Casper", "Beginner", 120, "Guided",
     "cha cha slide",
     "Called dance — follow the song's cues: slide left, slide right, take it back, hop, cha-cha real smooth, criss-cross, Charlie Brown, cha-cha now y'all."),

    ("Achy Breaky Heart", "Melanie Greenwood", "USA", "Achy Breaky Heart", "Billy Ray Cyrus", "Beginner", 120, "32 count, 4 wall",
     "achy breaky heart line dance",
     "1-8 Grapevine right + touch, grapevine left + touch.\n9-16 Rock forward R, recover, rock back R, recover; step ¼ turn.\n17-24 Hitchhiker thumbs over shoulders 4 counts.\n25-32 Two hip bumps R-L, boogie walk R-L-R-L."),

    ("Country Girl Shake", "Rachael McEnaney", "USA", "Country Girl (Shake It For Me)", "Luke Bryan", "Improver", 128, "32 count, 4 wall",
     "country girl shake line dance",
     "1-8 Step R, hitch L with ¼ turn, coaster step, walk L-R.\n9-16 Rocking chair, jazz box ¼ turn R.\n17-24 Side-behind-side-cross grapevine with shakes.\n25-32 Heel switches with hip shakes, step-turn-step."),

    ("Cruise", "Rob Fowler", "UK", "Cruise", "Florida Georgia Line", "Improver", 128, "48 count, 4 wall",
     "cruise line dance",
     "48-count intermediate by British choreographer Rob Fowler.\n1-8 Rocking chair, side-together-side-touch.\n9-16 Two forward shuffles, step-pivot-½, step forward.\n17-24 Weave right with cross-behind-side-cross, unwind ½ turn.\n25-48 Repeats with turning shuffles and hip rolls."),

    ("Footloose", "Various", "USA", "Footloose", "Kenny Loggins", "Improver", 130, "32 count, 4 wall",
     "footloose line dance",
     "1-8 Heel-toe R, heel-toe L, kick-ball-change x2.\n9-16 Grapevine R with ¼ turn, stomp; hip bumps.\n17-24 Two step-turns, four walking steps.\n25-32 Jazz box, monterey ½ turn."),

    ("Chattahoochee", "Traditional", "USA", "Chattahoochee", "Alan Jackson", "Improver", 140, "48 count, 2 wall",
     "chattahoochee line dance",
     "1-16 Toe struts + heel taps sequence R and L.\n17-32 Shuffles forward, coaster back, ½ pivot.\n33-48 Turning grapevine with claps + swivel step in place."),

    ("Redneck Girl", "Traditional", "USA", "Redneck Girl", "The Bellamy Brothers", "Beginner", 110, "40 count, 4 wall",
     "redneck girl line dance",
     "1-8 Grapevine R + hitch, grapevine L + hitch.\n9-16 Walk forward R-L-R, kick; walk back L-R-L, touch.\n17-24 Step, ½ pivot; step, ¼ pivot with hip pop.\n25-40 Jazz box, boogie walks, stomp finish."),

    ("The Git Up", "Various", "USA", "The Git Up", "Blanco Brown", "Beginner", 92, "32 count, 4 wall",
     "the git up line dance",
     "Called in the song.\n1-8 Cowboy boogie: R-L-R-L step-touch with knee pops.\n9-16 Two step, cha-cha, spin.\n17-24 'Two-step' + cowboy shuffle.\n25-32 Ride your horse, do the dosey doe, then it's back."),

    ("Old Town Road", "Various", "USA", "Old Town Road", "Lil Nas X", "Beginner", 136, "32 count, 4 wall",
     "old town road line dance",
     "1-8 Step-lock forward R and L.\n9-16 Rock forward R, recover, shuffle back ½ turn.\n17-24 Side-together-side, hip roll.\n25-32 Jazz box, unwind ½."),

    ("Meant To Be", "Rachael McEnaney", "USA", "Meant To Be", "Bebe Rexha & FGL", "Beginner", 130, "32 count, 4 wall",
     "meant to be line dance",
     "1-8 Basic R, basic L (side-together-side sway).\n9-16 Cross-side-behind, ¼ monterey turn.\n17-24 Two forward shuffles.\n25-32 Jazz box with cross, hip sway to close."),

    ("Body Like a Back Road", "Ira Weisburd", "USA", "Body Like a Back Road", "Sam Hunt", "Beginner", 106, "32 count, 4 wall",
     "body like a back road line dance",
     "1-8 Toe-heel-cross R, toe-heel-cross L.\n9-16 Side rocks with hip rolls.\n17-24 Jazz box, ¼ turn cross.\n25-32 Slow sways R-L, ½ pivot to next wall."),

    ("Whiskey On My Breath", "Karl-Harry Winson", "UK", "Whiskey On My Breath", "Love and Theft", "Intermediate", 132, "64 count, 2 wall",
     "whiskey on my breath line dance",
     "Slow, sultry 2-wall by UK choreographer Karl-Harry Winson.\n1-16 Slow crosses, sways, ¼-turn full turn.\n17-32 Diagonal walks, mambo step.\n33-48 Rolling vine, chassé ½.\n49-64 Nightclub basic, tag at chorus."),

    ("Neon Cowgirl", "Guyton Mundy", "USA", "Neon Cowgirl", "Dan + Shay", "Intermediate", 126, "32 count, 4 wall",
     "neon cowgirl line dance",
     "1-8 Side rock, cross shuffle, ¼ turn hitch.\n9-16 Full turn walk, coaster step, kick-ball-change.\n17-24 Weave with sweeps.\n25-32 Rock recover, ½ shuffle."),

    ("Hurricane", "Guyton Mundy", "USA", "Hurricane", "Luke Combs", "Intermediate", 148, "32 count, 4 wall",
     "hurricane line dance",
     "1-8 Heel jack R, heel jack L, cross-side.\n9-16 Rocking chair, ½ pivot into rock recover.\n17-24 Turning shuffle chain 1½ turns.\n25-32 Weave, sway, drag."),

    ("Fake ID", "Rachael McEnaney", "USA", "Fake ID", "Big & Rich", "Improver", 130, "32 count, 4 wall",
     "fake ID line dance footloose",
     "1-8 Kick-ball-change, kick-ball-change, jazz jump out-in.\n9-16 Vine R with ¼ turn, shuffle forward.\n17-24 Rocking chair, ½ pivot.\n25-32 Charleston kicks, close."),

    ("Save a Horse", "Traditional", "USA", "Save A Horse (Ride A Cowboy)", "Big & Rich", "Improver", 130, "48 count, 2 wall",
     "save a horse line dance",
     "48-count 2-wall barn-burner.\n1-16 Heel splits + boogie walk with hip pushes.\n17-32 Turning grapevine with lasso hand.\n33-48 Charleston + jazz box + ½ pivot."),

    ("Man! I Feel Like a Woman", "Max Perry", "USA", "Man! I Feel Like a Woman", "Shania Twain", "Improver", 124, "32 count, 4 wall",
     "man i feel like a woman line dance",
     "1-8 Toe struts R + L, sway hips right & left.\n9-16 Grapevine R with ¼ turn, hitch; walk L-R-L-clap.\n17-24 Step forward, ½ pivot, shuffle forward.\n25-32 Jazz box with ¼ turn cross, hip bumps."),

    ("God Blessed Texas", "Traditional", "USA", "God Blessed Texas", "Little Texas", "Improver", 138, "32 count, 4 wall",
     "god blessed texas line dance",
     "1-8 Heel splits + toe splits, jazz box.\n9-16 Grapevine R, ¼ turn hitch; grapevine L, hitch.\n17-24 Walk forward 4, shuffle turn ½.\n25-32 Kicks, stomps, hip pop close."),

    ("Trashy Women", "Traditional", "USA", "Trashy Women", "Confederate Railroad", "Improver", 128, "32 count, 4 wall",
     "trashy women line dance",
     "1-8 Toe-heel struts forward R + L.\n9-16 Vine R with ¼ turn, brush; vine L, scuff.\n17-24 Rocking chair, ½ pivot.\n25-32 Jazz box, cross unwind ½."),

    ("She's Country", "Rachael McEnaney", "USA", "She's Country", "Jason Aldean", "Intermediate", 140, "64 count, 4 wall",
     "shes country line dance",
     "64-count fast intermediate.\n1-16 Stomp-boot heel taps + rocking chair.\n17-32 Kick-ball-cross series + monterey ½.\n33-48 Skate-skate + shuffle diagonal + coaster.\n49-64 Turning weave + ½ pivot + stomp close."),

    ("Whiskey River", "Various", "USA", "Whiskey River", "Willie Nelson", "Beginner", 116, "32 count, 4 wall",
     "whiskey river line dance",
     "1-8 Grapevine R, brush; grapevine L, brush.\n9-16 Rock forward R, recover; coaster step back.\n17-24 Step forward, ½ pivot, step forward, ¼ pivot.\n25-32 Sway hips R-L-R-L, hip pop close."),

    ("Get Down Country", "Guyton Mundy", "USA", "Get Down Country", "Various", "Improver", 130, "32 count, 4 wall",
     "get down country line dance",
     "1-8 Toe strut R, heel drop, side rock cross.\n9-16 Chassé right, rock recover, chassé ¼ turn.\n17-24 Jazz box cross, unwind ½.\n25-32 Kick-ball-change, step lock forward."),

    ("Ten Toes", "Michele Perron", "USA", "Ten Toes", "Various", "Beginner", 108, "32 count, 4 wall",
     "ten toes line dance",
     "1-8 Toe touches R + L in place.\n9-16 Grapevine R + touch, grapevine L + touch.\n17-24 Step forward, ½ pivot, walk R-L.\n25-32 Sway, sway, jazz box."),

    ("Wobble", "V.I.C.", "USA", "Wobble", "V.I.C.", "Beginner", 130, "32 count, 4 wall",
     "wobble line dance",
     "Called in the song:\n1-8 Wobble forward, wobble back.\n9-16 Wobble right, wobble left.\n17-24 Cha-cha slide.\n25-32 ¼ turn to next wall + repeat."),

    ("Redneck Rodeo", "Rob Fowler", "UK", "Redneck Rodeo", "Various", "Improver", 130, "32 count, 4 wall",
     "redneck rodeo line dance",
     "British import by Rob Fowler.\n1-8 Heel splits + cross rock, ¼ turn shuffle.\n9-16 Jazz box, side rock cross.\n17-24 Full turn walk, coaster step.\n25-32 Kick-ball-cross, unwind ½."),

    ("Lose Control", "Sobrielo Mario", "Italy", "Lose Control", "Meduza", "Advanced", 124, "32 count, 4 wall",
     "lose control line dance",
     "Italian choreo — sharp EDM 4-wall.\n1-8 Cross rock, chassé ¼, ½ pivot, full turn.\n9-16 Body roll, coaster ½ turn.\n17-24 Side-behind-side-cross with sweep.\n25-32 Rock recover, syncopated ¾ turn."),

    # ---------- International adds ----------
    ("Islands in the Stream", "Traditional", "USA", "Islands in the Stream", "Kenny Rogers & Dolly Parton", "Beginner", 106, "48 count, 4 wall",
     "islands in the stream line dance",
     "Waltz-style beginner.\n1-12 Waltz forward-back R and L.\n13-24 Balance steps side-together-side.\n25-36 Turning waltz ¼ right.\n37-48 Twinkle steps + ½ pivot."),

    ("Islands In The Stream (Cha)", "Frank Trace", "USA", "Islands In The Stream", "Kenny Rogers & Dolly Parton", "Beginner", 106, "32 count, 4 wall",
     "islands in the stream cha line dance",
     "1-8 Step, lock, step forward R; rock forward L, recover R, coaster L.\n9-16 Vine R with brush; vine L with ¼ turn.\n17-24 Rock forward, recover, shuffle back; rock back, recover, shuffle forward.\n25-32 Jazz box with ¼ turn, hip bumps."),

    ("Canadian Stomp", "Traditional", "Canada", "Any 4/4 country track", "Various", "Beginner", 120, "32 count, 4 wall",
     "canadian stomp line dance",
     "1-8 Heel + toe struts R, L, R, L.\n9-16 Grapevine R with stomp, grapevine L with stomp.\n17-24 Rocking chair, ½ pivot.\n25-32 Two forward shuffles, stomp-stomp close."),

    ("Alan's 6", "Alan Birchall", "UK", "Various", "Various", "Intermediate", 128, "32 count, 4 wall",
     "alan 6 line dance",
     "1-8 Heel jack R, cross, heel jack L, cross.\n9-16 Side rock, cross shuffle; side rock, cross shuffle.\n17-24 Two ½ pivots forward, coaster.\n25-32 Rocking chair, jazz box ¼."),

    ("Amame", "Rachael McEnaney", "UK/USA", "Amame", "Various", "Intermediate", 100, "64 count, 4 wall",
     "amame line dance",
     "Latin-flavored intermediate.\n1-16 Cha-cha basics + cross rock.\n17-32 Rumba box + spot turn.\n33-48 Salsa cross-body lead into ½ turn.\n49-64 Cuban walks + hip figure-8."),

    ("Chill Factor", "Ross Brown", "UK", "Various", "Various", "Improver", 118, "32 count, 4 wall",
     "chill factor line dance",
     "1-8 Nightclub basic R and L.\n9-16 Rocking chair, ½ pivot.\n17-24 Cross-side-behind-side, ¼ hitch.\n25-32 Sway sway, jazz box cross."),

    ("Rock the Boat", "Traditional", "USA", "Rock the Boat", "The Hues Corporation", "Beginner", 108, "32 count, 4 wall",
     "rock the boat line dance",
     "1-8 Grapevine R with hip roll, grapevine L with hip roll.\n9-16 Rock forward and back R-L-R-L (rock the boat).\n17-24 Full turn walking R, coaster L.\n25-32 Two ½ pivots, stomp."),

    ("The Cowgirl Twist", "Michael Barr", "USA", "Country track", "Various", "Beginner", 110, "32 count, 4 wall",
     "cowgirl twist line dance",
     "1-8 Twist heels R-L-R-L in place.\n9-16 Boot-hook heel-strut.\n17-24 Grapevine R with ¼ turn, brush.\n25-32 Rock forward, recover, coaster back."),

    ("Ah Si", "Guillaume Richard", "France", "Ah Si", "Various", "Improver", 100, "32 count, 4 wall",
     "ah si line dance",
     "French choreo — smooth 32-count.\n1-8 Nightclub basic + cross rock.\n9-16 ¼ chassé, rock recover, ½ shuffle.\n17-24 Full turn walk, coaster.\n25-32 Sways, cross, unwind ½."),

    ("Bosa Nova", "Rob Fowler", "UK", "Various", "Various", "Intermediate", 116, "48 count, 4 wall",
     "bosa nova line dance",
     "Bossa-flavored intermediate.\n1-16 Cross rock + side-close + hip figure-8.\n17-32 Sway series + spot turn.\n33-48 Latin cross-body walk + syncopated ½."),

    ("Better When I'm Dancin'", "Junior Willis", "UK", "Better When I'm Dancin'", "Meghan Trainor", "Beginner", 122, "32 count, 4 wall",
     "better when im dancin line dance",
     "1-8 Toe struts forward R & L, side rock cross.\n9-16 Sway sway, jazz box ¼ turn.\n17-24 Kick-ball-change, step-turn ½.\n25-32 Shuffle forward, rock recover, coaster."),

    ("Cha Cha Amor", "Séverine Fillion", "France", "Various", "Various", "Improver", 108, "32 count, 4 wall",
     "cha cha amor line dance",
     "1-8 Cha-cha basic forward, ½ pivot.\n9-16 Cross rock, side-together-side.\n17-24 Full turn shuffle chain.\n25-32 Rock recover, coaster, chassé cross."),

    ("Cha Cha Lengua", "Peter Metelnick & Alison Biggs", "UK", "Cha Cha Lengua", "Various", "Improver", 110, "32 count, 4 wall",
     "cha cha lengua line dance",
     "1-8 Vine R, brush; vine L, brush.\n9-16 Cha-cha forward, cha-cha back.\n17-24 ½ pivot, ¼ pivot, side-together-cross.\n25-32 Hip sways R-L-R-L, jazz cross."),

    ("Coastin'", "Rob Fowler", "UK", "Coastin'", "Various", "Beginner+", 118, "32 count, 4 wall",
     "coastin line dance rob fowler",
     "1-8 Step lock forward R + L, ½ pivot.\n9-16 Rock recover, coaster, shuffle ¼.\n17-24 Sway sway, jazz box cross.\n25-32 Kick-ball-cross, unwind ½."),

    ("Dance With Me", "Rachael McEnaney", "USA", "Dance With Me Tonight", "Olly Murs", "Improver", 128, "48 count, 4 wall",
     "dance with me tonight line dance",
     "48-count with 2 tags.\n1-16 Toe-heel struts, chassé ¼.\n17-32 Cha-cha basic + spot ½ turn.\n33-48 Rocking chair, jazz box, hip pops."),

    ("Down on the Farm", "Chris Hodgson", "UK", "Down on the Farm", "Tim McGraw", "Improver", 132, "32 count, 2 wall",
     "down on the farm line dance",
     "1-8 Rocking chair, ½ pivot.\n9-16 Vine R + heel, vine L + heel.\n17-24 Kick-ball-change x2, walk R-L.\n25-32 Jazz box cross, unwind ½."),

    ("El Paso", "Robbie McGowan Hickie", "UK", "Any Latin track", "Various", "Improver", 100, "32 count, 4 wall",
     "el paso line dance",
     "1-8 Cross rock, chassé ¼ turn.\n9-16 Rock recover, coaster back.\n17-24 Nightclub basic R, syncopated ½.\n25-32 Sway hips 4, jazz cross."),

    ("Ghost Town", "Guyton Mundy", "USA", "Ghost Town", "Adam Lambert", "Intermediate", 128, "32 count, 4 wall",
     "ghost town line dance",
     "1-8 Body roll down + up, ¼ turn hitch.\n9-16 Weave R with sweeps.\n17-24 Rock recover, shuffle ½, walk R-L.\n25-32 Jazz box with ¾ turn."),

    ("Havana", "Guillaume Richard", "France", "Havana", "Camila Cabello", "Intermediate", 105, "32 count, 4 wall",
     "havana line dance",
     "Cuban-inflected intermediate.\n1-8 Cross rock + chassé ¼.\n9-16 Rumba box, spot turn full.\n17-24 Cuban walks + cross unwind ½.\n25-32 Hip figure-8 into next wall."),

    ("Jerusalema", "Ravil Yamaliev", "Russia", "Jerusalema", "Master KG feat. Nomcebo", "Beginner", 124, "24 count, 4 wall",
     "jerusalema line dance",
     "Viral 2020 anthem, 24-count.\n1-8 R touch out-in, L touch out-in, step-together-step.\n9-16 Grapevine R with hop, grapevine L with hop.\n17-24 Two ½ pivots + kick-out-in-close."),

    ("Ladies Night", "Peter Metelnick", "UK", "Ladies Night", "Kool & The Gang", "Improver", 106, "32 count, 4 wall",
     "ladies night line dance",
     "1-8 Toe struts + hip bumps R and L.\n9-16 Vine R with ¼ turn, chassé ¼.\n17-24 Rocking chair, jazz box.\n25-32 Kick-ball-change x2, close."),

    ("Live Like You're Loved", "Rachael McEnaney-White", "USA/UK", "Live Like You're Loved", "Hawk Nelson", "Improver", 100, "32 count, 4 wall",
     "live like youre loved line dance",
     "1-8 Nightclub basic + cross unwind ½.\n9-16 Sway series with drag.\n17-24 Rock recover, shuffle ½.\n25-32 Jazz box cross, hip roll."),

    ("Loco Elbow", "Frank Trace", "USA", "Loco Elbow", "The Refreshments", "Improver", 128, "32 count, 4 wall",
     "loco elbow line dance",
     "1-8 Heel-hook combo + shuffle forward.\n9-16 Rocking chair + jazz box ¼.\n17-24 Vine R with brush, vine L with hitch.\n25-32 Step-turn ½ + coaster + stomp."),

    ("Lonely Drum", "Rob Fowler", "UK", "Lonely Drum", "Aaron Goodvin", "Improver", 100, "48 count, 4 wall",
     "lonely drum line dance",
     "48-count Rob Fowler.\n1-16 Slow diagonals + sway drag.\n17-32 Weave, ¼ turn, shuffle ½.\n33-48 Jazz box, cross unwind, stomp close."),

    ("Marina Bay Sands", "Elvie Ward", "Singapore", "Various pop", "Various", "Beginner", 110, "32 count, 4 wall",
     "marina bay sands line dance",
     "Singaporean choreo — bright pop.\n1-8 Vine R with clap, vine L with clap.\n9-16 Rock recover, coaster back.\n17-24 ½ pivot, step-turn ¼.\n25-32 Hip bumps, jazz cross."),

    ("Never Enough", "Rachael McEnaney-White", "USA", "Never Enough", "Loren Allred (Greatest Showman)", "Improver", 84, "32 count, 4 wall",
     "never enough line dance",
     "Slow, dramatic improver.\n1-8 Cross rock + chassé, sway drag.\n9-16 Full turn walk + coaster.\n17-24 Nightclub basic + syncopated ½.\n25-32 Jazz cross, unwind, hold."),

    ("Rockin' Chair", "Traditional", "USA", "Any country track", "Various", "Beginner", 118, "32 count, 4 wall",
     "rockin chair line dance",
     "1-8 Rocking chair R-L-R-L, twice.\n9-16 Vine R with clap, vine L with clap.\n17-24 Two ½ pivots.\n25-32 Hip bumps + jazz box."),

    ("Sangria", "Peter Metelnick & Alison Biggs", "UK", "Sangria", "Blake Shelton", "Improver", 108, "32 count, 4 wall",
     "sangria line dance metelnick",
     "1-8 Cross rock + chassé ¼.\n9-16 Rock recover, coaster, walk R-L.\n17-24 Kick-ball-cross, ¼ monterey.\n25-32 Sway sway, jazz cross."),

    ("Small Town Saturday Night", "Bill Bader", "Canada", "Small Town Saturday Night", "Hal Ketchum", "Improver", 132, "32 count, 4 wall",
     "small town saturday night line dance",
     "1-8 Vine R with brush, vine L with brush.\n9-16 Rocking chair + ¼ monterey.\n17-24 Kick-ball-change + shuffle ½.\n25-32 Jazz box + hip bumps."),

    ("Stealing Cinderella", "Rob Fowler", "UK", "Stealing Cinderella", "Chuck Wicks", "Improver", 88, "48 count, 4 wall",
     "stealing cinderella line dance",
     "48-count slow ballad.\n1-16 Sway drag + rocking chair.\n17-32 Weave R + ¼ hitch + full turn.\n33-48 Jazz cross + unwind ½ + coaster."),

    ("Sway", "Séverine Fillion", "France", "Sway", "Michael Bublé", "Improver", 116, "32 count, 4 wall",
     "sway line dance michael buble",
     "1-8 Cha-cha basic + spot turn.\n9-16 Cross rock + chassé ¼.\n17-24 Full turn walk + coaster.\n25-32 Hip sways, jazz cross."),

    ("Take It Off", "Rachael McEnaney", "USA", "Take It Off", "Ke$ha", "Improver", 125, "32 count, 4 wall",
     "take it off line dance kesha",
     "1-8 Heel jack R + cross, heel jack L + cross.\n9-16 Kick-ball-change + step-turn ½.\n17-24 Shuffle diagonal + coaster.\n25-32 Hip pops + jazz cross."),

    ("Tequila Sheila", "Peter Metelnick", "UK", "Tequila Sheila", "Various", "Beginner", 108, "32 count, 4 wall",
     "tequila sheila line dance",
     "1-8 Toe struts R + L, hip bumps.\n9-16 Vine R with hitch, vine L with scuff.\n17-24 Rocking chair, ½ pivot.\n25-32 Jazz box, unwind ½."),

    ("The Galway Girl", "Maggie Gallagher", "Ireland", "Galway Girl", "Ed Sheeran / Steve Earle", "Improver", 100, "32 count, 4 wall",
     "galway girl line dance",
     "Irish-flavored improver by Maggie Gallagher.\n1-8 Heel jacks R + L with claps.\n9-16 Rocking chair + jazz box.\n17-24 Grapevine ¼ + shuffle.\n25-32 Two ½ pivots + Irish stomp close."),

    ("Waltz Across Texas", "Traditional", "USA", "Waltz Across Texas", "Ernest Tubb", "Beginner", 90, "48 count, 4 wall",
     "waltz across texas line dance",
     "3/4 waltz timing.\n1-12 Waltz forward + back R and L.\n13-24 Twinkle steps R-L-R-L.\n25-36 Turning waltz ¼.\n37-48 Balance sway + close."),

    ("Watermelon Sugar", "Kate Sala", "UK", "Watermelon Sugar", "Harry Styles", "Improver", 95, "32 count, 4 wall",
     "watermelon sugar line dance",
     "Kate Sala improver — 32 counts.\n1-8 Cross rock, chassé ¼, ½ pivot.\n9-16 Nightclub basic + syncopated ½.\n17-24 Weave R with sweeps.\n25-32 Jazz cross + hip roll."),

    ("Chill Out Cha", "Ira Weisburd", "USA", "Various latin", "Various", "Beginner", 100, "32 count, 4 wall",
     "chill out cha line dance",
     "1-8 Cha-cha forward and back.\n9-16 Rumba box.\n17-24 ¼ pivot + spot turn.\n25-32 Jazz box + sway close."),

    ("Country as Can Be", "Guyton Mundy", "USA", "Country as Can Be", "Justin Moore", "Improver", 138, "32 count, 4 wall",
     "country as can be line dance",
     "1-8 Rocking chair, jazz box ¼.\n9-16 Vine with sweeps.\n17-24 Kick-ball-cross, monterey ¼.\n25-32 ½ pivot chain + stomp."),

    ("Cha Cha Espanol", "José Miguel Belloque Vane", "Netherlands", "Various latin", "Various", "Improver", 108, "32 count, 4 wall",
     "cha cha espanol line dance",
     "1-8 Cross rock + chassé.\n9-16 Rumba box, hip figure-8.\n17-24 Full turn shuffle chain.\n25-32 Rock recover, coaster close."),

    ("Fields of Gold", "Kate Sala", "UK", "Fields of Gold", "Eva Cassidy / Sting", "Improver", 84, "32 count, 2 wall",
     "fields of gold line dance",
     "Slow, lyrical.\n1-16 Diagonal walks + sway drag.\n17-24 Nightclub basic + syncopated ½.\n25-32 Cross unwind + hold + coaster."),

    ("Tulsa Time", "Traditional", "USA", "Tulsa Time", "Don Williams", "Beginner", 116, "32 count, 4 wall",
     "tulsa time line dance",
     "1-8 Vine R + touch, vine L + touch.\n9-16 Rock forward, ½ shuffle back.\n17-24 Two ½ pivots forward.\n25-32 Kick-ball-change + hip pop."),

    ("Beer Barrel Polka", "Traditional", "Germany/USA", "Beer Barrel Polka", "Various", "Beginner", 132, "32 count, 4 wall",
     "beer barrel polka line dance",
     "Polka feel — light and bouncy.\n1-8 Polka step R + L (step-close-step-hop).\n9-16 Grapevine R + kick, grapevine L + kick.\n17-24 Two ½ pivots.\n25-32 Heel clicks + close."),

    ("Chattahoochee (Cha)", "Traditional", "USA", "Chattahoochee", "Alan Jackson", "Improver", 140, "32 count, 4 wall",
     "chattahoochee cha line dance",
     "1-8 Cha-cha forward + cha-cha back.\n9-16 Vine R with ¼ turn, chassé ¼.\n17-24 Rocking chair, ½ pivot.\n25-32 Jazz box, unwind ½."),

    ("Boogie Woogie Feelin'", "Bill Bader", "Canada", "Boogie Woogie Feelin'", "Various", "Improver", 128, "48 count, 2 wall",
     "boogie woogie feelin line dance",
     "48-count Canadian classic.\n1-16 Rocking chair + jazz box + ¼ pivot.\n17-32 Two shuffles + step-lock-step chain.\n33-48 Hip bumps + boogie walk + stomp close."),

    ("Cumbia Semi Sweet", "Ira Weisburd", "USA", "Various cumbia", "Various", "Beginner", 100, "32 count, 4 wall",
     "cumbia semi sweet line dance",
     "1-8 Cumbia basic R + L (step-drag-step).\n9-16 Cross rock, chassé.\n17-24 ½ pivot, coaster.\n25-32 Hip sways, jazz cross."),

    ("Danish Nightingale", "Kate Sala", "UK", "Nightingale", "Demi Lovato", "Improver", 84, "32 count, 4 wall",
     "danish nightingale line dance",
     "Slow, lyrical Kate Sala.\n1-8 Cross rock, chassé ¼, sway.\n9-16 Weave R with sweeps.\n17-24 Nightclub basic + ½ pivot.\n25-32 Jazz cross + hold."),

    ("El Diablo Waltz", "Ira Weisburd", "USA", "El Diablo", "Various", "Improver", 96, "48 count, 4 wall",
     "el diablo waltz line dance",
     "3/4 waltz.\n1-12 Waltz forward + back.\n13-24 Twinkle R-L-R-L.\n25-36 Turning waltz ¼ + balance.\n37-48 Sway drag + close."),

    ("Gone West", "Rachael McEnaney-White", "USA", "Gone West", "Various", "Improver", 116, "32 count, 4 wall",
     "gone west line dance",
     "1-8 Cross rock + chassé, ¼ turn.\n9-16 Rocking chair + jazz box.\n17-24 Full turn walk + coaster.\n25-32 Hip sways + jazz cross."),

    ("Highway Don't Care", "Chris Hodgson", "UK", "Highway Don't Care", "Tim McGraw / Taylor Swift", "Improver", 116, "32 count, 4 wall",
     "highway dont care line dance",
     "1-8 Vine R + heel, vine L + heel.\n9-16 Rock forward, shuffle back.\n17-24 Two ½ pivots + coaster.\n25-32 Jazz box cross + unwind ½."),

    ("Malaguena", "Rob Fowler", "UK", "Malaguena", "Various", "Advanced", 132, "48 count, 2 wall",
     "malaguena line dance rob fowler",
     "Advanced 2-wall Spanish flavor.\n1-16 Weave R + syncopated ¾ turn + sweep.\n17-32 Cross unwind ½ + walk full turn.\n33-48 Rock recover, shuffle ½, hip figure-8, jazz cross."),

    ("Marmalade Cha", "Peter Metelnick", "UK", "Various", "Various", "Improver", 108, "32 count, 4 wall",
     "marmalade cha line dance",
     "1-8 Cha-cha basic + cross rock.\n9-16 ¼ chassé + rock recover, shuffle.\n17-24 Full turn shuffle chain.\n25-32 Sways, jazz cross."),

    ("Nashville Nightlife", "Guyton Mundy", "USA", "Various country", "Various", "Intermediate", 132, "32 count, 4 wall",
     "nashville nightlife line dance",
     "1-8 Heel jack R + L with crosses.\n9-16 Rocking chair + ¼ monterey.\n17-24 Turning shuffle chain 1½.\n25-32 Jazz box + hip pops."),

    ("Ok Ok", "Ira Weisburd", "USA", "OK OK", "Robin Schulz", "Beginner", 112, "32 count, 4 wall",
     "ok ok line dance",
     "1-8 Vine R with clap, vine L with clap.\n9-16 Rocking chair + jazz box.\n17-24 ½ pivot chain.\n25-32 Sway + jazz cross."),

    ("Peace Train", "Ross Brown", "UK", "Peace Train", "Cat Stevens", "Improver", 112, "32 count, 4 wall",
     "peace train line dance",
     "1-8 Toe struts R + L, hip bumps.\n9-16 Vine R with brush, vine L with hitch.\n17-24 Two ½ pivots + coaster.\n25-32 Kick-ball-cross + close."),

    ("Rewind", "Rachael McEnaney-White", "USA", "Rewind", "Rascal Flatts", "Improver", 130, "32 count, 4 wall",
     "rewind line dance",
     "1-8 Kick-ball-change x2 + jazz jump.\n9-16 Vine R ¼ turn + shuffle.\n17-24 Rocking chair + ½ pivot.\n25-32 Jazz cross + unwind ½."),

    ("Shivers", "Karl-Harry Winson", "UK", "Shivers", "Ed Sheeran", "Improver", 141, "32 count, 4 wall",
     "shivers line dance ed sheeran",
     "1-8 Cross rock, chassé ¼, ½ pivot.\n9-16 Weave R with sweeps.\n17-24 Rock recover, shuffle ½, walk.\n25-32 Jazz cross, unwind ½."),

    ("Some Beach", "Michele Perron", "Canada", "Some Beach", "Blake Shelton", "Improver", 128, "32 count, 4 wall",
     "some beach line dance",
     "1-8 Toe struts + hip bumps.\n9-16 Vine ¼ + monterey ½.\n17-24 Rock recover + coaster.\n25-32 Jazz box + hip pops."),

    ("Speechless", "Rachael McEnaney-White", "USA", "Speechless", "Dan + Shay", "Improver", 132, "32 count, 4 wall",
     "speechless line dance dan shay",
     "1-8 Sway drag + rocking chair.\n9-16 Cross rock + chassé ¼.\n17-24 Full turn walk + coaster.\n25-32 Jazz cross + unwind."),

    ("Sun Tan", "Séverine Fillion", "France", "Various pop", "Various", "Beginner", 110, "32 count, 4 wall",
     "sun tan line dance",
     "1-8 Vine R with clap, vine L with clap.\n9-16 Rocking chair + jazz box.\n17-24 Two ½ pivots + coaster.\n25-32 Hip sways + jazz cross."),

    ("Toes", "Ira Weisburd", "USA", "Toes", "Zac Brown Band", "Beginner", 110, "32 count, 4 wall",
     "toes line dance zac brown",
     "1-8 Heel-toe R + L, side rock cross.\n9-16 Vine R ¼ turn, chassé ¼.\n17-24 Rocking chair + coaster.\n25-32 Jazz cross + sway close."),

    ("Uptown Funk", "Rachael McEnaney", "USA", "Uptown Funk", "Mark Ronson feat. Bruno Mars", "Improver", 115, "32 count, 4 wall",
     "uptown funk line dance",
     "1-8 Toe struts + hip bumps.\n9-16 Vine ¼ + monterey ½.\n17-24 Kick-ball-cross + shuffle ½.\n25-32 Jazz cross + funk arms."),

    ("Verano Porteno", "José Miguel Belloque Vane", "Netherlands", "Tango tracks", "Various", "Advanced", 116, "64 count, 4 wall",
     "verano porteno line dance",
     "Argentine tango feel, 64-count.\n1-16 Cross rock + syncopated ¾ + drag.\n17-32 Ochos + full turn + jazz cross.\n33-48 Nightclub + spot turn chain.\n49-64 Weave with sweeps + ½ pivot close."),

    ("Waltz of the Angels", "Kate Sala", "UK", "Waltz of the Angels", "Various", "Improver", 100, "48 count, 4 wall",
     "waltz of the angels line dance",
     "3/4 waltz improver.\n1-12 Waltz forward + back R and L.\n13-24 Turning waltz + balance.\n25-36 Twinkle chain.\n37-48 Sway drag + close."),

    ("Yippee Ki Yay", "Rachael McEnaney-White", "USA", "Various country", "Various", "Improver", 132, "32 count, 4 wall",
     "yippee ki yay line dance",
     "1-8 Rocking chair + jazz box ¼.\n9-16 Vine + sweeps.\n17-24 Turning shuffle chain.\n25-32 Kick-ball-cross + stomp."),
]
