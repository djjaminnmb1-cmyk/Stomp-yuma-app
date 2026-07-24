"""Additional line dances (batch 2) for Stompin' Ground Yuma.
Each row: (name, choreographer, choreographer_country, song, artist, difficulty,
          bpm, count, youtube_query, step_sheet_note).

Notes:
- Choreographer attribution reflects the most widely-taught version. Instructors
  can edit any dance record to update details.
- Step-sheet field contains a short pointer note; instructors are expected to
  upload the official step-sheet image via the dance detail page after review.
- YouTube URL is generated at seed time via a YouTube search query so it always
  resolves to the current top demo — this is the app's built-in YouTube autofill
  pattern (identical to how the import endpoint handles blank youtube_url).
"""

SEED_DANCES_V2 = [
    # ---------- Beginner country classics ----------
    ("Chicken Dance", "Traditional", "Germany", "The Chicken Dance", "Bob Kames", "Beginner", 132, "Guided",
     "chicken dance line dance",
     "Party dance called out to the song: flap arms (beak/wings), chicken shakes, four claps, then partner spin. Repeat with the tempo increasing."),

    ("Ten Step", "Bill Bader", "USA", "Various country", "Various", "Beginner", 104, "10 count, 1 wall",
     "country ten step line dance",
     "Classic 10-count travelling dance. Heel R fwd, step R next to L, heel L fwd, step L next to R, R heel fwd, R toe back, R heel fwd, step R fwd, walk L-R-L fwd. Suits a wide variety of country songs."),

    ("Applejack", "Traditional", "USA", "Various country", "Various", "Beginner", 120, "32 count, 4 wall",
     "applejack line dance",
     "Signature applejack heel-toe swivels; heel-splits with toe-touches; vine R & L with a ¼ turn. Loved for its old-school clogging feel."),

    ("Amazed", "Sue Lipscomb", "USA", "Amazed", "Lonestar", "Improver", 84, "48 count, 2 wall",
     "amazed line dance lonestar",
     "Smooth waltz-feel improver. Combines sway drags, crossing waltz box, and a ½ turn pivot. Instructor to upload the printable step-sheet image."),

    ("God's Country", "Rob Fowler", "UK", "God's Country", "Blake Shelton", "Improver", 129, "32 count, 4 wall",
     "gods country line dance rob fowler",
     "Punchy improver. Vine ¼ + kick-ball-cross, syncopated rock-recovers, jazz box with turns. Great party opener."),

    ("Whiskey Glasses", "Guyton Mundy", "USA", "Whiskey Glasses", "Morgan Wallen", "Improver", 138, "32 count, 4 wall",
     "whiskey glasses line dance guyton mundy",
     "Radio-hit improver. Chassé R + rock recover, chassé L + rock recover, jazz box ¼, kick-ball-step + step-lock-step."),

    ("Redneck Woman", "Various", "USA", "Redneck Woman", "Gretchen Wilson", "Beginner", 110, "32 count, 4 wall",
     "redneck woman line dance",
     "High-energy beginner. Vines with stomps, hip bumps, ½ pivot, jazz box."),

    ("Chicken Fried", "Rachael McEnaney", "USA/UK", "Chicken Fried", "Zac Brown Band", "Improver", 130, "32 count, 4 wall",
     "chicken fried line dance",
     "Fan-favourite improver. Heel switches + kick-ball-change, ¼ turn shuffles, jazz cross, syncopated weave."),

    ("Dirt Road Anthem", "Guyton Mundy", "USA", "Dirt Road Anthem", "Jason Aldean", "Improver", 76, "32 count, 4 wall",
     "dirt road anthem line dance",
     "Half-time feel improver — great for smooth stylin'. Combines Charleston kicks, weave with sweeps, and a slow ½ turn."),

    ("Country Roads", "Rachael McEnaney-White", "USA", "Country Roads", "John Denver", "Improver", 84, "32 count, 2 wall",
     "country roads line dance",
     "Slow, sing-along friendly improver. Rocking chair, weave with drag, ¼ turn pivot, jazz cross."),

    # ---------- More country favourites ----------
    ("Amarillo Sky", "Bill Bader", "Canada", "Amarillo Sky", "Jason Aldean", "Improver", 116, "32 count, 4 wall",
     "amarillo sky line dance",
     "Improver with a great chorus lift. Kick-ball-changes, ½ pivots, chassé ¼, sway drags."),

    ("Cowboy Charleston", "Traditional", "USA", "Various country swing", "Various", "Beginner", 120, "32 count, 4 wall",
     "cowboy charleston line dance",
     "Classic Charleston kicks travelling forward + back, ¼ turn stomps, jazz box. Ubiquitous line dance floor-filler."),

    ("Cowboy Motion", "Diane Jamieson", "USA", "Various country", "Various", "Improver", 118, "48 count, 2 wall",
     "cowboy motion line dance",
     "Two-wall improver. Cross-rock, chassé, ½ monterey, weave to a ¼ turn."),

    ("Fifty Shades of Hay", "Guyton Mundy", "USA", "Various country", "Various", "Improver", 128, "32 count, 4 wall",
     "fifty shades of hay line dance",
     "Popular improver. Cross-rock + shuffle, ¼ turn pivot, kick-ball-cross, syncopated rock + step."),

    ("Good Time", "Bill Bader", "Canada", "Good Time", "Alan Jackson", "Beginner", 130, "32 count, 4 wall",
     "good time line dance alan jackson",
     "Party beginner. Toe struts, hip bumps, ¼ turn pivots, jazz box."),

    ("Hillbilly Rock", "Traditional", "USA", "Hillbilly Rock", "Marty Stuart", "Beginner", 148, "32 count, 4 wall",
     "hillbilly rock line dance",
     "Fast rockabilly-flavoured beginner. Vines with stomps, kick-ball-changes, jazz box with clap."),

    ("Honky Tonk Stomp", "Bill Bader", "Canada", "Honky Tonk Stomp", "Brooks & Dunn", "Beginner", 120, "32 count, 4 wall",
     "honky tonk stomp line dance",
     "Bar-friendly beginner. Grapevines, kick-ball-changes, ½ pivots, stomps on the accents."),

    ("Honky Tonk Twist", "Neville Fitzgerald", "UK", "Various honky-tonk", "Various", "Improver", 118, "32 count, 4 wall",
     "honky tonk twist line dance",
     "Twisty improver — twist-heel splits, jazz cross with unwind, ¼ turn chassé."),

    ("I Love This Bar", "Bill Bader", "Canada", "I Love This Bar", "Toby Keith", "Beginner", 106, "32 count, 4 wall",
     "i love this bar line dance",
     "Easy singalong beginner. Vines with stomps, rocking chair, ½ pivot, jazz box."),

    ("Just A Kiss", "Rachael McEnaney", "USA/UK", "Just A Kiss", "Lady A", "Improver", 74, "32 count, 4 wall",
     "just a kiss line dance",
     "Ballad-feel improver. Sway drags, cross rock + chassé, ½ turn unwind, weave with sweeps."),

    ("Long Neck Bottle", "Bill Bader", "Canada", "Long Neck Bottle", "Garth Brooks", "Beginner", 120, "32 count, 4 wall",
     "long neck bottle line dance",
     "Honky-tonk beginner. Toe struts, vines with stomps, ¼ turn pivots, jazz box."),

    ("Louisiana Hot Sauce", "Alan Haywood", "UK", "Various zydeco", "Various", "Improver", 128, "32 count, 4 wall",
     "louisiana hot sauce line dance",
     "Zydeco-flavoured improver. Heel-switches, ¼ turn shuffles, kick-ball-cross, weave with hitch."),

    ("Mama Maria", "Séverine Fillion", "France", "Mama Maria", "Ricchi e Poveri", "Improver", 118, "32 count, 4 wall",
     "mama maria line dance severine fillion",
     "Popular Euro-line improver. Cross rock + chassé, ¼ pivot, weave with a full unwind."),

    ("My Maria", "Bill Bader", "Canada", "My Maria", "Brooks & Dunn", "Beginner", 130, "32 count, 4 wall",
     "my maria line dance",
     "Country radio beginner. Vine with stomp, rocking chair, ½ pivot, kick-ball-change."),

    ("Nothin' On But The Radio", "Guyton Mundy", "USA", "Nothin' On But The Radio", "Gary Allan", "Improver", 84, "32 count, 4 wall",
     "nothin on but the radio line dance",
     "Smooth ballad improver. Sway drags, ¼ turn pivot with sweep, jazz cross."),

    ("Once A Day", "Bill Bader", "Canada", "Once A Day", "Various", "Beginner", 108, "32 count, 4 wall",
     "once a day line dance",
     "Easy beginner. Toe struts, vine + touch, rocking chair, jazz box with turn."),

    ("Passenger Seat", "Bill Bader", "Canada", "Passenger Seat", "Stephen Speaks", "Improver", 108, "32 count, 4 wall",
     "passenger seat line dance",
     "Gentle improver. Cross rock, chassé, ½ pivot, weave with hitch."),

    ("Rockin' The Beer Gut", "Bill Bader", "Canada", "Rockin' The Beer Gut", "Trailer Choir", "Beginner", 130, "32 count, 4 wall",
     "rockin the beer gut line dance",
     "Rowdy party beginner. Hip bumps, vines with stomps, ½ pivots, jazz box."),

    ("Route 66", "Bill Bader", "Canada", "Route 66", "Various", "Improver", 130, "32 count, 4 wall",
     "route 66 line dance",
     "Swing/rockabilly improver. Toe struts, side rock-recover, ½ pivots, kick-ball-cross."),

    ("Shake It Off", "Rachael McEnaney-White", "USA", "Shake It Off", "Taylor Swift", "Beginner", 80, "32 count, 4 wall",
     "shake it off line dance taylor swift",
     "Pop crossover beginner. Toe struts, hip shakes, ¼ pivot, jazz box."),

    ("Small Town USA", "Bill Bader", "Canada", "Small Town USA", "Justin Moore", "Beginner", 128, "32 count, 4 wall",
     "small town usa line dance",
     "Fun beginner. Heel switches, vines, rocking chair, ½ pivot."),

    ("Somebody Like You", "Bill Bader", "Canada", "Somebody Like You", "Keith Urban", "Improver", 132, "32 count, 4 wall",
     "somebody like you line dance",
     "Popular improver. Cross rock + chassé, jazz box with ¼ turn, weave with sweeps."),

    ("Southbound", "Guyton Mundy", "USA", "Southbound", "Carrie Underwood", "Improver", 128, "32 count, 4 wall",
     "southbound line dance carrie underwood",
     "High-energy improver. Kick-ball-changes, ¼ turn chassés, syncopated rock recovers, jazz cross."),

    ("Southern Girl", "Bill Bader", "Canada", "Southern Girl", "Tim McGraw", "Beginner", 116, "32 count, 4 wall",
     "southern girl line dance",
     "Warm beginner. Toe struts, vines with stomps, rocking chair, jazz box."),

    ("Straight Tequila Night", "Bill Bader", "Canada", "Straight Tequila Night", "John Anderson", "Beginner", 108, "32 count, 4 wall",
     "straight tequila night line dance",
     "Two-step-feel beginner. Vines with claps, ¼ pivots, coaster steps."),

    ("Sweet Caroline", "Rachael McEnaney-White", "USA", "Sweet Caroline", "Neil Diamond", "Beginner", 128, "32 count, 4 wall",
     "sweet caroline line dance",
     "Party crowd-pleaser. Toe struts, sway sway, ¼ turn pivots, jazz box."),

    ("Tequila Makes Her Clothes Fall Off", "Bill Bader", "Canada", "Tequila Makes Her Clothes Fall Off", "Joe Nichols", "Beginner", 114, "32 count, 4 wall",
     "tequila makes her clothes fall off line dance",
     "Cheeky beginner. Vines with stomps, kick-ball-changes, ½ pivot, jazz box."),

    ("The Fireman", "Bill Bader", "Canada", "The Fireman", "George Strait", "Beginner", 120, "32 count, 4 wall",
     "the fireman line dance",
     "Old-school George Strait beginner. Vines, walk forward + shuffle, ½ pivot, coaster step."),

    ("Two Pina Coladas", "Bill Bader", "Canada", "Two Pina Coladas", "Garth Brooks", "Beginner", 100, "32 count, 4 wall",
     "two pina coladas line dance",
     "Beach-vibes beginner. Vines with stomps, rocking chair, ¼ pivot, jazz box."),

    ("Whiskey Girl", "Bill Bader", "Canada", "Whiskey Girl", "Toby Keith", "Beginner", 132, "32 count, 4 wall",
     "whiskey girl line dance",
     "Rowdy party beginner. Toe struts, hip bumps, ½ pivots, jazz box."),

    ("Would You Go With Me", "Bill Bader", "Canada", "Would You Go With Me", "Josh Turner", "Improver", 132, "32 count, 4 wall",
     "would you go with me line dance",
     "Popular improver. Vine + kick, kick-ball-change, ¼ turn chassé, weave with sweep."),

    ("Yee Haw", "Bill Bader", "Canada", "Yee Haw", "Jake Owen", "Beginner", 128, "32 count, 4 wall",
     "yee haw line dance jake owen",
     "Fun party beginner. Toe struts, hip shakes, vine ¼, jazz box."),

    # ---------- Pop/crossover favourites ----------
    ("Blurred Lines", "Rachael McEnaney", "USA/UK", "Blurred Lines", "Robin Thicke", "Improver", 120, "32 count, 4 wall",
     "blurred lines line dance rachael mcenaney",
     "Funky improver. Toe struts, hip bumps, ¼ pivot, kick-ball-cross, jazz box."),

    ("Happy", "Rachael McEnaney-White", "USA", "Happy", "Pharrell Williams", "Beginner", 80, "32 count, 4 wall",
     "happy line dance pharrell",
     "Feel-good beginner (half-time count). Vines with clap, rocking chair, ½ pivot, jazz cross."),

    ("Perfect", "Rachael McEnaney-White", "USA", "Perfect", "Ed Sheeran", "Improver", 63, "32 count, 2 wall",
     "perfect line dance ed sheeran",
     "Romantic waltz-feel improver. Sway drags, cross behind unwind, ½ turn pivot with sweep, weave."),

    ("Shape of You", "Rachael McEnaney-White", "USA", "Shape of You", "Ed Sheeran", "Improver", 96, "32 count, 4 wall",
     "shape of you line dance",
     "Popular pop crossover improver. Heel-switches, kick-ball-cross, ¼ turn shuffles, jazz cross."),

    # ---------- Latin / world flavour ----------
    ("La Bamba", "Traditional", "Mexico/USA", "La Bamba", "Ritchie Valens", "Beginner", 168, "32 count, 4 wall",
     "la bamba line dance",
     "Latin-flavoured beginner. Vines, mambo steps, ¼ turn pivots, jazz box."),

    ("Mambo Italiano", "Michele Perron", "Italy", "Mambo Italiano", "Rosemary Clooney", "Improver", 138, "32 count, 4 wall",
     "mambo italiano line dance",
     "Retro-swing improver. Mambo steps, jazz box ¼, cross-behind-side, side-rock-cross."),

    ("Salsa Verde", "Séverine Fillion", "France", "Salsa track", "Various", "Improver", 96, "32 count, 4 wall",
     "salsa verde line dance",
     "Latin improver. Salsa side-basic, cross rock + chassé, ¼ turn pivot, weave."),

    ("Bachata Cha", "Ira Weisburd", "USA", "Bachata track", "Various", "Improver", 122, "32 count, 4 wall",
     "bachata cha line dance ira weisburd",
     "Cha-cha-influenced improver. Cha-cha basics, cross rock, ¼ turn, weave with hip sway."),

    # ---------- Community favourites ----------
    ("Reggaeton", "Séverine Fillion", "France", "Reggaeton track", "Various", "Improver", 92, "32 count, 4 wall",
     "reggaeton line dance severine",
     "Reggaeton improver. Body rolls, side rocks, ¼ turn chassé, jazz cross."),

    ("Country Swing", "Traditional", "USA", "Various country swing", "Various", "Beginner", 120, "32 count, 4 wall",
     "country swing line dance",
     "Classic swing beginner. Toe struts, side rock + cross, ½ pivot, jazz box."),
]
