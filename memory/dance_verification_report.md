# Dance verification report (508 audited)

- `looks_correct`      : **211**
- `wrong_song`         : **10**  ← needs fixing
- `wrong_choreographer`: **6**  ← needs fixing
- `generic_song`       : **106**  ← placeholder
- `unknown_dance`      : **174**  ← too obscure to judge

## Wrong song (10)

| Dance | Choreographer | Current song / artist | LLM suggestion | Confidence |
|---|---|---|---|---|
| Call Me | Séverine Fillion | Call Me Maybe — Carly Rae Jepsen | The dance is named "Call Me" but the song listed is "Call Me Maybe" by Carly Rae Jepsen. These are different songs; the dance name and song title mismatch suggests either the dance name or the song title is incorrect. | medium |
| Cover Me Up | Rachael McEnaney-White | Cover Me Up — Morgan Wallen | Cover Me Up is originally by Jason Isbell; the Morgan Wallen version exists but the well-known line dance by Rachael McEnaney-White was choreographed to the Jason Isbell recording — verify which version was intended | medium |
| Danish Nightingale | Kate Sala | Nightingale — Demi Lovato | The Kate Sala dance 'Danish Nightingale' is danced to 'Nightingale' by Yanni or a classical/instrumental piece, not Demi Lovato; Demi Lovato does have a song called 'Nightingale' but this pairing is not recognised | medium |
| Little Red Book | Rachael McEnaney-White | Little Red Wagon — Miranda Lambert | The dance is named 'Little Red Book'; the recorded song 'Little Red Wagon' by Miranda Lambert does not match the dance name. If the dance was choreographed to 'Little Red Wagon' the dance name itself may be wrong, or this is a song mismatch. 'Little Red Book' as a line dance is not a title I can firmly match to Miranda Lambert — flagging as wrong_song pending verification. | medium |
| Ok Ok | Ira Weisburd | OK OK — Robin Schulz | Ira Weisburd's 'Ok Ok' is danced to 'OK' by Robin Schulz feat. James Blunt, not a standalone 'Robin Schulz' credit; also the primary song association may differ — worth verifying the exact track | medium |
| On the Verge | Rob Fowler | On the Verge — Collin Raye | The song 'On the Verge' is associated with Collin Raye, but the well-known line dance 'On the Verge' choreographed by Rob Fowler is set to 'On the Verge' by Eric Church, not Collin Raye. Correct artist is likely Eric Church. | high |
| Sold (The Grundy County Auction) | Traditional | Sold — John Michael Montgomery | The correct song title is 'Sold (The Grundy County Auction Incident)' by John Michael Montgomery; also 'Traditional' choreographer attribution is questionable for this specific named dance | medium |
| Tequila Highway | Rachael McEnaney-White | Tequila Little Time — Jon Pardi | Tequila Highway by Charlie Crockett, or verify if this dance was choreographed to 'Tequila Little Time' by Jon Pardi — 'Tequila Highway' is a known Charlie Crockett song; the song title mismatch with the dance name is suspicious | medium |
| Turn the Radio On | Rachael McEnaney-White | Turn on the Radio — Reba McEntire | Song title should be 'Turn on the Radio' by Reba McEntire — the dance name 'Turn the Radio On' may itself be a minor title error, or the song field is correct and the dance name is slightly off; either way the song title on record does match Reba McEntire's actual song 'Turn on the Radio', so the dance name is the mismatch | medium |
| Yeah! | Rachael McEnaney-White | Yeah! — Joe Nichols | "Yeah!" is by Usher (feat. Lil Jon & Ludacris), not Joe Nichols. Joe Nichols does not have a well-known song called "Yeah!". | high |

## Wrong choreographer (6)

| Dance | Choreographer | Current song / artist | LLM suggestion | Confidence |
|---|---|---|---|---|
| Achy Breaky Heart | Melanie Greenwood | Achy Breaky Heart — Billy Ray Cyrus | The widely credited choreographer for Achy Breaky Heart is Melanie Greenwood — however some sources credit Billy Blackwood or attribute it differently; Melanie Greenwood is plausible but not universally confirmed, confidence is medium | medium |
| Life's a Dance | Traditional | Life's a Dance — John Michael Montgomery | Life's a Dance is widely credited to John Brant / traditional community choreography, not simply 'Traditional' as a named choreographer — however the song/artist pairing with John Michael Montgomery is correct | medium |
| Rockin' the Wagon Wheel | Various | Wagon Wheel — Darius Rucker | Choreographer listed as 'Various' is a placeholder; this dance is likely attributed to a specific choreographer — needs verification | low |
| Tequila | Various | Tequila — Dan + Shay | Choreographer listed as 'Various' is a placeholder; 'Tequila' to Dan + Shay is associated with specific choreographers — needs verification | low |
| Whiskey River | Various | Whiskey River — Willie Nelson | Choreographer field 'Various' is a placeholder; multiple choreographers have created 'Whiskey River' dances — the most noted version is by Gary Lafferty or similar named choreographer, not 'Various' | medium |
| Wobble | V.I.C. | Wobble — V.I.C. | V.I.C. is the recording artist, not the choreographer. The Wobble line dance choreographer is typically credited to a line dance instructor, not the artist. | high |

## Generic / placeholder song (106)

| Dance | Choreographer | Current song / artist | LLM suggestion | Confidence |
|---|---|---|---|---|
| Alan's 6 | Alan Birchall | Various — Various | A specific song title should be provided instead of 'Various' | high |
| Applejack | Traditional | Various country — Various | Applejack is a traditional pattern dance; 'Various country' is a placeholder | high |
| Ay Papi | Ira Weisburd | Various — Various | Replace 'Various' with the specific song title used for this dance | high |
| Bachata Cha | Ira Weisburd | Bachata track — Various | Song field should be a specific title, not 'Bachata track' | high |
| Bailar Cha | Ira Weisburd | Various cha — Various | Replace 'Various cha' with the specific song title used for this dance | high |
| Balaio | Ira Weisburd | Balaio — Various samba | Artist field 'Various samba' is a genre placeholder, not a specific artist/song | high |
| Beach Cha Cha | Ira Weisburd | Various cha — Various | Replace 'Various cha' with the specific song title used for this dance | high |
| Bosa Nova | Rob Fowler | Various — Various | Song and artist fields are both 'Various'; a specific song title and artist must be provided | high |
| Butterfly Waltz | Kate Sala | Butterfly — Various | Artist field is 'Various' — a specific artist/recording should be listed | medium |
| Canadian Stomp | Traditional | Any 4/4 country track — Various | Replace 'Any 4/4 country track' with a specific song title | high |
| Cha Cha Amor | Séverine Fillion | Various — Various | A specific song title should be provided instead of 'Various' | high |
| Cha Cha Espanol | José Miguel Belloque Vane | Various latin — Various | Song field should be a specific title rather than 'Various latin' | high |
| Cha Cha Loca | Ira Weisburd | Various cha — Various | Song field 'Various cha' is a genre placeholder, not a specific title | high |
| Cha Cha Real Smooth | Ira Weisburd | Various cha — Various | Song field 'Various cha' is a genre placeholder, not a specific title | high |
| Chill Factor | Ross Brown | Various — Various | A specific song title should be provided instead of 'Various' | high |
| Chill Out Cha | Ira Weisburd | Various latin — Various | Song field should be a specific title, not 'Various latin' | high |
| Coastin' | Rob Fowler | Coastin' — Various | Song field should be a specific title; artist listed as 'Various' suggests placeholder data | medium |
| Come to Me (Waltz) | Kate Sala | Come to Me — Various | Artist field is 'Various' — a specific artist/recording should be listed | medium |
| Corazón Latino | Séverine Fillion | Corazón Latino — Various | Artist field is 'Various'; no specific song artist identified | medium |
| Cotton Fields | Traditional | Cotton Fields — Various | The artist field 'Various' suggests no specific recording is cited; a known recording such as Creedence Clearwater Revival or Lead Belly should be specified | medium |
| Country Nights | Bill Bader | Various country — Various | Song field 'Various country' is a placeholder, not a specific title | high |
| Country Swing | Traditional | Various country swing — Various | Song field should be a specific title, not 'Various country swing' | high |
| Cowboy Boogie | Traditional | Various country — Various | Song field 'Various country' is a placeholder, not a specific title | high |
| Cowboy Cha (Reboot) | Neville Fitzgerald | Various cha — Various | Song field 'Various cha' is a placeholder, not a specific title | high |
| Cowboy Charleston | Traditional | Various country swing — Various | 'Various country swing' is a placeholder, not a specific song title | high |
| Cowboy Hustle | Traditional | Various country — Various | Song field 'Various country' is a placeholder, not a specific title | high |
| Cowboy Motion | Diane Jamieson | Various country — Various | 'Various country' is a placeholder, not a specific song title | high |
| Cowboy Twist | Traditional | Various country — Various | Song field 'Various country' is a placeholder, not a specific title | high |
| Cruise (Remix) | Various | Cruise (Remix) — Florida Georgia Line ft. Nelly | Choreographer field contains 'Various' — a specific choreographer should be named if this is a distinct registered dance | high |
| Cuban Cha Cha | Ira Weisburd | Various cha — Various | Replace 'Various cha' with the specific song title used for this dance | high |
| Cuban Salsa | Ira Weisburd | Salsa track — Various | Song field 'Salsa track' is a genre placeholder, not a specific title | high |
| Cumbia Semi Sweet | Ira Weisburd | Various cumbia — Various | Song field should be a specific title rather than 'Various cumbia' | high |
| Dance with Me Cha | Ira Weisburd | Various — Various | Replace 'Various' with the specific song title used for this dance | high |
| Deep in the Heart of Texas | Traditional | Deep in the Heart of Texas — Various | Artist field 'Various' suggests no specific recording is cited; a known recording should be specified | medium |
| Do You Wanna Dance | Rob Fowler | Do You Wanna Dance — Various | Artist field is 'Various' — a specific song and artist should be recorded | high |
| Dreams of Yuma (Waltz) | Various | Dreams — Various | Both choreographer and artist are 'Various'; song title is vague — specific details needed | high |
| El Camino | Ira Weisburd | El Camino — Various | Artist field is 'Various'; no specific song artist identified | medium |
| El Paso | Robbie McGowan Hickie | Any Latin track — Various | Song field should be a specific title, not 'Any Latin track' | high |
| El Ritmo | Séverine Fillion | El Ritmo — Various | Artist field is 'Various'; no specific song artist identified | medium |
| Emerald Waltz | Kate Sala | Emerald — Various | Artist field is 'Various' — a specific artist/recording should be listed | medium |
| Fiesta Loca | Séverine Fillion | Fiesta Loca — Various | Artist field is 'Various'; no specific song artist identified | medium |
| Fifty Shades of Hay | Guyton Mundy | Various country — Various | 'Various country' is a placeholder, not a specific song title | high |
| Footloose | Various | Footloose — Kenny Loggins | Choreographer field 'Various' is a placeholder; a specific choreographer should be named | medium |
| Fuego (Cha) | Ira Weisburd | Fuego — Various | Artist field is 'Various'; if the song is specifically 'Fuego' a known artist should be listed (e.g. Pitbull) | medium |
| Genuine Rednecks | Rob Fowler | Various country rock — Various | Song field 'Various country rock' and artist 'Various' are placeholders — a specific song and artist should be recorded | high |
| Gone West | Rachael McEnaney-White | Gone West — Various | Song field should be a specific title rather than 'Various' | high |
| Guantanamera | Traditional | Guantanamera — Various | Artist field is 'Various'; a specific recording (e.g. Pete Seeger, Celia Cruz, Wyclef Jean) should be listed | medium |
| Guy What Turned Me On | Séverine Fillion | Various — Various | Song field should be a specific title rather than 'Various' | high |
| Highland Waltz | Kate Sala | Highland Cathedral — Various | Artist field is 'Various' — a specific recording of Highland Cathedral should be cited | medium |
| Honky Tonk Twist | Neville Fitzgerald | Various honky-tonk — Various | 'Various honky-tonk' is a placeholder, not a specific song title | high |
| Just Because | Various | Just Because — Various | Song and artist fields should reference a specific track rather than 'Various' | high |
| Kicks | Rob Fowler | Various — Various | Song field is a placeholder 'Various'; a specific song should be listed | high |
| Lady's Night | Bill Bader | Various — Various | Song field is a placeholder 'Various'; a specific song should be listed | high |
| Latin Fever (Cha) | Ira Weisburd | Various — Various | Replace 'Various' with the specific song title used for this dance | high |
| Lonely (Cha) | Ira Weisburd | Lonely — Various | Artist field 'Various' is a placeholder; a specific recording of 'Lonely' should be identified | medium |
| Louisiana Hot Sauce | Alan Haywood | Various zydeco — Various | 'Various zydeco' is a placeholder, not a specific song title | high |
| Mambo Beat | Ira Weisburd | Various mambo — Various | Replace 'Various mambo' with the specific song title used for this dance | high |
| Marina Bay Sands | Elvie Ward | Various pop — Various | Song field should be a specific title, not 'Various pop' | high |
| Marmalade Cha | Peter Metelnick | Various — Various | Song field should be a specific title rather than 'Various' | high |
| Merengue Beat | Ira Weisburd | Merengue track — Various | Song field 'Merengue track' is a genre placeholder, not a specific title | high |
| Mi Amor Cha | Ira Weisburd | Various cha — Various | Replace 'Various cha' with the specific song title used for this dance | high |
| Moonlight Waltz | Kate Sala | Moonlight — Various | Artist field is 'Various' — a specific artist/recording should be listed | medium |
| Nashville Nightlife | Guyton Mundy | Various country — Various | Song field should be a specific title rather than 'Various country' | high |
| Never Say Never | Rachael McEnaney-White | Never Say Never — Various | Artist field is 'Various'; a specific recording/artist should be listed even if the dance can be done to multiple songs | medium |
| Nightclub Two-Step Beginner | Traditional | Various ballad — Various | Song field 'Various ballad' is a placeholder, not a specific title | high |
| Ocean (Cha) | Ira Weisburd | Ocean — Various | Artist field 'Various' is a placeholder; a specific recording of 'Ocean' should be identified | medium |
| Old Town Road | Various | Old Town Road — Lil Nas X | Choreographer field 'Various' is a placeholder; specific choreographies to Old Town Road exist with named choreographers | medium |
| Once A Day | Bill Bader | Once A Day — Various | Artist field 'Various' is a placeholder; 'Once A Day' is a classic country song (Connie Smith, etc.) — a specific artist should be named | high |
| Pachanga | Ira Weisburd | Pachanga track — Various | Song field 'Pachanga track' is a genre placeholder, not a specific title | high |
| Party in Havana | Ira Weisburd | Various — Various | Replace 'Various' with the specific song title used for this dance | high |
| Pour Me a Cold One | Rob Fowler | Various — Various | Song field should be a specific title, not 'Various' | high |
| Pretty Little Sinner | Rachael McEnaney-White | Various — Various | Song field should be a specific title, not 'Various' | high |
| Redneck Christmas | Various | Redneck 12 Days of Christmas — Jeff Foxworthy | Choreographer field contains 'Various' — should be a specific choreographer name if one exists | medium |
| Reggaeton | Séverine Fillion | Reggaeton track — Various | Song field should be a specific title, not 'Reggaeton track' | high |
| Rockin' Around the Christmas Tree | Various | Rockin' Around the Christmas Tree — Brenda Lee | Choreographer field contains 'Various' — should be a specific choreographer name if one exists | medium |
| Rockin' Chair | Traditional | Any country track — Various | Song field should be a specific title, not 'Any country track' | high |
| Route 66 | Bill Bader | Route 66 — Various | Artist field 'Various' is a placeholder; a specific recording artist should be named | high |
| Rumba Latina | Ira Weisburd | Various rumba — Various | Song field 'Various rumba' is a genre placeholder, not a specific title | high |
| Rumba Nights | Ira Weisburd | Various rumba — Various | Replace 'Various rumba' with the specific song title used for this dance | high |
| Salsa Party | Ira Weisburd | Various salsa — Various | A specific salsa song title should be listed rather than 'Various salsa' | high |
| Salsa Verde | Séverine Fillion | Salsa track — Various | Song field 'Salsa track' and artist 'Various' are placeholders; a specific song title and artist should be named | high |
| Samba Boom | Ira Weisburd | Various samba — Various | Song field 'Various samba' is a genre placeholder, not a specific title | high |
| Sea of Heartbreak (Waltz) | Kate Sala | Sea of Heartbreak — Various | Artist field is 'Various' — a specific artist/recording should be listed | medium |
| Silver Waltz | Kate Sala | Silver — Various | Artist field is 'Various' — a specific artist/recording should be listed | medium |
| Slap Leather | Gayle Brandon | Slap Leather — Various | Artist field 'Various' indicates no specific recording is cited; a real song title and artist should be provided | high |
| Southbound Train | Rob Fowler | Southbound Train — Various | Artist field is 'Various' — a specific artist/recording should be listed for the song 'Southbound Train' | medium |
| Spurs and Latitude | Rob Fowler | Various — Various | Song field should be a specific title, not 'Various' | high |
| Stealing the Best Man | Rob Fowler | Various — Various | Song and artist are both 'Various' — specific song title and artist should be provided | high |
| Sun Tan | Séverine Fillion | Various pop — Various | Song field should be a specific title rather than 'Various pop' | high |
| Sway with Me (Waltz) | Kate Sala | Sway — Various | Artist field is 'Various' — a specific artist/recording of Sway should be cited | medium |
| Tango Belloq | José Miguel Belloque Vane | Various tango — Various | Song field should be a specific tango title rather than 'Various tango' | high |
| Ten Step | Bill Bader | Various country — Various | Ten Step is a traditional pattern dance danced to various country tracks; song field is a placeholder | high |
| Tequila Sheila | Peter Metelnick | Tequila Sheila — Various | Artist listed as 'Various' suggests placeholder; specific artist should be Bobby G. Rice or similar classic country artist for 'Tequila Sheila' | medium |
| TEST_Import_ad6694 | Chor | S — A | Record appears to be a test/import placeholder; dance name, choreographer, song, and artist fields all contain stub values | high |
| The Cowgirl Twist | Michael Barr | Country track — Various | Replace 'Country track' with a specific song title | high |
| The Git Up | Various | The Git Up — Blanco Brown | Choreographer field 'Various' is a placeholder; The Git Up by Blanco Brown has specific known choreographers | medium |
| Tropical Cha | Ira Weisburd | Various — Various | A specific song title should be listed rather than 'Various' | high |
| Tush Push | Jim Ferrazzano | Tush Push — Various | Song field should be a specific title; the Tush Push is danced to many songs but the artist field 'Various' confirms this is a placeholder | high |
| Un Poquito Mas | Ira Weisburd | Various — Various | A specific song title should be listed rather than 'Various' | high |
| Vamonos | Ira Weisburd | Various — Various | A specific song title should be listed rather than 'Various' | high |
| Verano Porteno | José Miguel Belloque Vane | Tango tracks — Various | Song field should be a specific title rather than 'Tango tracks' | high |
| Waltz Across the Floor | Kate Sala | Various waltz — Various | Song field 'Various waltz' is a placeholder, not a specific title | high |
| Wild Country | Rob Fowler | Wild Country — Various | The artist field 'Various' indicates no specific song is tied to this dance record; a real song title and artist should be provided. | high |
| Yippee Ki Yay | Rachael McEnaney-White | Various country — Various | Song field should reference a specific track; 'Various country' is a placeholder | high |
| Yuma Waltz | Various | Various waltz — Various | Both song 'Various waltz' and choreographer 'Various' are placeholders — specific details needed | high |
| Zumba Beat | Ira Weisburd | Various zumba — Various | A specific song title should be listed rather than 'Various zumba' | high |

## Unknown dance (LLM couldn't verify) (174)

| Dance | Choreographer | Current song / artist | LLM suggestion | Confidence |
|---|---|---|---|---|
| Ah Si | Guillaume Richard | Ah Si — Various |  | low |
| All Shook Up | Traditional | All Shook Up — Elvis Presley |  | low |
| Amame | Rachael McEnaney | Amame — Various |  | low |
| Amarillo Sky | Bill Bader | Amarillo Sky — Jason Aldean |  | low |
| Amazed | Sue Lipscomb | Amazed — Lonestar |  | low |
| Amazed Waltz | Sue Lipscomb | Amazed — Lonestar |  | low |
| American Pie | Various | American Pie — Don McLean |  | low |
| Bailamos | Ira Weisburd | Bailamos — Enrique Iglesias |  | low |
| Bamboléo | Séverine Fillion | Bamboléo — Gipsy Kings |  | low |
| Believer | Séverine Fillion | Believer — Imagine Dragons |  | low |
| Blue Suede Shoes | Traditional | Blue Suede Shoes — Elvis Presley |  | low |
| Body Language | Séverine Fillion | Body Language — Jesse McCartney |  | low |
| Body Like a Back Road | Ira Weisburd | Body Like a Back Road — Sam Hunt |  | low |
| Boogie Woogie Feelin' | Bill Bader | Boogie Woogie Feelin' — Various |  | low |
| Boom Boom Boom | Séverine Fillion | Boom Boom Boom — Vengaboys |  | low |
| Boot Scootin' Boogie (Remix) | Various | Boot Scootin' Boogie (Remix) — Brooks & Dunn |  | low |
| Boots on the Ground | Rob Fowler | Boots on the Ground — 907 Chosen |  | low |
| Breathe Easy | Rachael McEnaney-White | Breathe Easy — Lady A |  | low |
| Brown Eyed Girl | Various | Brown Eyed Girl — Van Morrison |  | low |
| Cake by the Ocean | Séverine Fillion | Cake by the Ocean — DNCE |  | low |
| Cha Cha Lengua | Peter Metelnick & Alison Biggs | Cha Cha Lengua — Various |  | low |
| Chained to the Rhythm | Séverine Fillion | Chained to the Rhythm — Katy Perry |  | low |
| Chattahoochee | Traditional | Chattahoochee — Alan Jackson |  | low |
| Chattahoochee Boogie | Various | Chattahoochee — Alan Jackson |  | low |
| Chattahoochee Charleston | Rachael McEnaney | Chattahoochee — Alan Jackson |  | low |
| Cheap Thrills | Séverine Fillion | Cheap Thrills — Sia |  | low |
| Chicken Dance | Traditional | The Chicken Dance — Bob Kames |  | low |
| Chicken Fried | Rachael McEnaney | Chicken Fried — Zac Brown Band |  | low |
| Chicken Wing | Séverine Fillion | Chicken Wing — Various |  | low |
| Come Over When You're Sober | Rachael McEnaney-White | Come Over When You're Sober — Post Malone |  | low |
| Country Boy | Rachael McEnaney-White | Country Boy — Aaron Lewis |  | low |
| Country Girl (Charleston) | Rob Fowler | Country Girl (Shake It for Me) — Luke Bryan |  | low |
| Country Girl Shake | Rachael McEnaney | Country Girl (Shake It For Me) — Luke Bryan |  | low |
| Country Roads | Rachael McEnaney-White | Country Roads — John Denver |  | low |
| Country State of Mind | Rachael McEnaney-White | Country State of Mind — Josh Turner |  | low |
| Countryman | Rob Fowler | Countryman — Luke Bryan |  | low |
| Cowboy Cha Cha | Traditional | Neon Moon — Brooks & Dunn |  | low |
| Crazy (Patsy Cline) | Traditional | Crazy — Patsy Cline |  | low |
| Cruise | Rob Fowler | Cruise — Florida Georgia Line |  | low |
| Cruise Control | Rob Fowler | Cruise — Florida Georgia Line |  | low |
| Dance Baby Dance | Bill Bader | Dance Baby Dance — Chris Cagle |  | low |
| Dance Little Jean | Traditional | Dance Little Jean — Nitty Gritty Dirt Band |  | low |
| Despacito | Séverine Fillion | Despacito — Luis Fonsi |  | low |
| Dibbi Dibbi | Séverine Fillion | Dibbi Dibbi Sound — DJ Dee |  | low |
| Dirt Road Anthem | Guyton Mundy | Dirt Road Anthem — Jason Aldean |  | low |
| Djobi Djoba | Séverine Fillion | Djobi Djoba — Gipsy Kings |  | low |
| Down at the Twist and Shout | Traditional | Down at the Twist and Shout — Mary Chapin Carpenter |  | low |
| Down on the Farm | Chris Hodgson | Down on the Farm — Tim McGraw |  | low |
| El Diablo Waltz | Ira Weisburd | El Diablo — Various |  | low |
| Fancy Line | Rob Fowler | Fancy — Reba McEntire |  | low |
| Feels So Right (Alabama) | Traditional | Feels So Right — Alabama |  | low |
| Firework | Séverine Fillion | Firework — Katy Perry |  | low |
| Forever Waltz | Kate Sala | Forever and Ever, Amen — Randy Travis |  | low |
| Fried Green Tomatoes | Bill Bader | Fried Green Tomatoes — Bellamy Brothers |  | low |
| Get Down Country | Guyton Mundy | Get Down Country — Various |  | low |
| Girl Crazy | Rachael McEnaney-White | Girl Crazy — Eli Young Band |  | low |
| Girls Like You | Rachael McEnaney-White | Girls Like You — Maroon 5 |  | low |
| God Blessed Texas | Traditional | God Blessed Texas — Little Texas |  | low |
| God Only Knows | Rachael McEnaney-White | God Only Knows — for KING & COUNTRY |  | low |
| God's Country | Rob Fowler | God's Country — Blake Shelton |  | low |
| Good Directions | Bill Bader | Good Directions — Billy Currington |  | low |
| Good Time | Bill Bader | Good Time — Alan Jackson |  | low |
| Hard Candy Christmas | Traditional | Hard Candy Christmas — Dolly Parton |  | low |
| Hard to Handle | Rob Fowler | Hard to Handle — The Black Crowes |  | low |
| He Didn't Have to Be | Bill Bader | He Didn't Have to Be — Brad Paisley |  | low |
| Heads Carolina, Tails California | Rachael McEnaney-White | Heads Carolina, Tails California — Jo Dee Messina / Cole Swindell |  | low |
| Heads Up (Line) | Rachael McEnaney-White | Heads Up — PJ Morton |  | low |
| Here for the Party | Rob Fowler | Here for the Party — Gretchen Wilson |  | low |
| Here's a Quarter | Traditional | Here's a Quarter — Travis Tritt |  | low |
| Hey Bartender | Rachael McEnaney-White | Hey Bartender — Lady A |  | low |
| Hey Pretty Girl | Rachael McEnaney-White | Hey Pretty Girl — Kip Moore |  | low |
| Hillbilly Rock | Traditional | Hillbilly Rock — Marty Stuart |  | low |
| Hips Don't Lie | Séverine Fillion | Hips Don't Lie — Shakira |  | low |
| Hold My Beer | Rachael McEnaney-White | Hold My Beer — Randy Rogers & Wade Bowen |  | low |
| Home Sweet Home | Rachael McEnaney-White | Home Sweet Home — Carrie Underwood |  | low |
| Honey Bee | Rob Fowler | Honey Bee — Blake Shelton |  | low |
| Honky Tonk Badonkadonk | Rob Fowler | Honky Tonk Badonkadonk — Trace Adkins |  | low |
| Honky Tonk Stomp | Bill Bader | Honky Tonk Stomp — Brooks & Dunn |  | low |
| Hush Hush | Rachael McEnaney-White | Hush Hush — The Pussycat Dolls |  | low |
| I Cross My Heart | Bill Bader | I Cross My Heart — George Strait |  | low |
| I Hold On | Rachael McEnaney-White | I Hold On — Dierks Bentley |  | low |
| I Love It | Rachael McEnaney-White | I Love It — Icona Pop |  | low |
| I Love This Bar | Bill Bader | I Love This Bar — Toby Keith |  | low |
| I Melt | Rachael McEnaney-White | I Melt — Rascal Flatts |  | low |
| I'm Gonna Love You Anyway | Rachael McEnaney-White | I'm Gonna Love You Anyway — Trace Adkins |  | low |
| Islands in the Stream | Traditional | Islands in the Stream — Kenny Rogers & Dolly Parton |  | low |
| Islands In The Stream (Cha) | Frank Trace | Islands In The Stream — Kenny Rogers & Dolly Parton |  | low |
| Jerusalema | Ravil Yamaliev | Jerusalema — Master KG feat. Nomcebo |  | low |
| Just A Kiss | Rachael McEnaney | Just A Kiss — Lady A |  | low |
| Kentucky Rain | Bill Bader | Kentucky Rain — Elvis Presley |  | low |
| La Bamba | Traditional | La Bamba — Ritchie Valens |  | low |
| La Bomba | Séverine Fillion | La Bomba — King Africa |  | low |
| La Isla Bonita | Séverine Fillion | La Isla Bonita — Madonna |  | low |
| La Vida Loca | Ira Weisburd | Livin' La Vida Loca — Ricky Martin |  | low |
| Ladies Night | Peter Metelnick | Ladies Night — Kool & The Gang |  | low |
| Levitating | Rachael McEnaney-White | Levitating — Dua Lipa |  | low |
| Life is a Highway | Rob Fowler | Life is a Highway — Rascal Flatts |  | low |
| Loco Elbow | Frank Trace | Loco Elbow — The Refreshments |  | low |
| Long Neck Bottle | Bill Bader | Long Neck Bottle — Garth Brooks |  | low |
| Lose Control | Sobrielo Mario | Lose Control — Meduza |  | low |
| Love Story (Waltz) | Kate Sala | Love Story — Taylor Swift |  | low |
| Malaguena | Rob Fowler | Malaguena — Various |  | low |
| Malibu | Séverine Fillion | Malibu — Miley Cyrus |  | low |
| Mama Maria | Séverine Fillion | Mama Maria — Ricchi e Poveri |  | low |
| Mambo Italiano | Michele Perron | Mambo Italiano — Rosemary Clooney |  | low |
| Mamma Mia | Séverine Fillion | Mamma Mia — ABBA |  | low |
| Mueve la Colita | Séverine Fillion | Mueve la Colita — El Símbolo |  | low |
| My Maria | Bill Bader | My Maria — Brooks & Dunn |  | low |
| My Way (Waltz) | Kate Sala | My Way — Frank Sinatra |  | low |
| Neon Cowgirl | Guyton Mundy | Neon Cowgirl — Dan + Shay |  | low |
| New Rules | Séverine Fillion | New Rules — Dua Lipa |  | low |
| On My Way | Séverine Fillion | On My Way — Alan Walker |  | low |
| One Way Ticket (Latin) | Séverine Fillion | One Way Ticket — Eruption |  | low |
| Papa Loved Mama | Traditional | Papa Loved Mama — Garth Brooks |  | low |
| Peace Train | Ross Brown | Peace Train — Cat Stevens |  | low |
| Perfect Waltz | Kate Sala | Perfect — Ed Sheeran |  | low |
| Piano Man (Waltz) | Kate Sala | Piano Man — Billy Joel |  | low |
| Pop a Top | Traditional | Pop a Top — Alan Jackson |  | low |
| Praying for Daylight | Traditional | Prayin' for Daylight — Rascal Flatts |  | low |
| Redneck Girl | Traditional | Redneck Girl — The Bellamy Brothers |  | low |
| Redneck Rodeo | Rob Fowler | Redneck Rodeo — Various |  | low |
| Redneck Woman | Various | Redneck Woman — Gretchen Wilson |  | low |
| Rewind | Rachael McEnaney-White | Rewind — Rascal Flatts |  | low |
| Rewrite the Stars | Rachael McEnaney-White | Rewrite the Stars — Zac Efron & Zendaya |  | low |
| Right My Wrongs | Rachael McEnaney-White | Right My Wrongs — Chris Janson |  | low |
| Ring of Fire | Traditional | Ring of Fire — Johnny Cash |  | low |
| Roar | Séverine Fillion | Roar — Katy Perry |  | low |
| Rock the Boat | Traditional | Rock the Boat — The Hues Corporation |  | low |
| Rocky Top | Traditional | Rocky Top — The Osborne Brothers |  | low |
| Roses | Séverine Fillion | Roses — The Chainsmokers |  | low |
| Save a Horse | Traditional | Save A Horse (Ride A Cowboy) — Big & Rich |  | low |
| Say So | Rachael McEnaney-White | Say So — Doja Cat |  | low |
| Shallow | Rachael McEnaney-White | Shallow — Lady Gaga & Bradley Cooper |  | low |
| She Thinks My Tractor's Sexy | Bill Bader | She Thinks My Tractor's Sexy — Kenny Chesney |  | low |
| She's Country (Beginner) | Bill Bader | She's Country — Jason Aldean |  | low |
| Sherry Baby | Traditional | Sherry — The Four Seasons |  | low |
| Sofia | Séverine Fillion | Sofia — Álvaro Soler |  | low |
| Sold (Beginner) | Bill Bader | Sold (The Grundy County Auction) — John Michael Montgomery |  | low |
| Sorry (Bieber) | Séverine Fillion | Sorry — Justin Bieber |  | low |
| Speechless Waltz | Kate Sala | Speechless — Dan + Shay |  | low |
| Stitches | Séverine Fillion | Stitches — Shawn Mendes |  | low |
| Stompin' Ground | Erin Boroughs | Line Up and Let It Roll — DJ Jamin |  | low |
| Summer Sway | Rachael McEnaney-White | 21 Summer — Brothers Osborne |  | low |
| Sunflower | Rachael McEnaney-White | Sunflower — Post Malone & Swae Lee |  | low |
| Sweet But Psycho | Séverine Fillion | Sweet But Psycho — Ava Max |  | low |
| Sweet Caroline | Rachael McEnaney-White | Sweet Caroline — Neil Diamond |  | low |
| Take My Breath Away (Waltz) | Kate Sala | Take My Breath Away — Berlin |  | low |
| Ten Toes | Michele Perron | Ten Toes — Various |  | low |
| This Is Country Music | Rob Fowler | This Is Country Music — Brad Paisley |  | low |
| Thunder Rolls | Traditional | The Thunder Rolls — Garth Brooks |  | low |
| Ticks | Rob Fowler | Ticks — Brad Paisley |  | low |
| Til' the Cows Come Home | Rob Fowler | Til' the Cows Come Home — Clay Walker |  | low |
| Tim McGraw (Taylor Swift) | Rachael McEnaney-White | Tim McGraw — Taylor Swift |  | low |
| Trashy Women | Traditional | Trashy Women — Confederate Railroad |  | low |
| Traveller | Rachael McEnaney-White | Traveller — Chris Stapleton |  | low |
| Truck Bed | Rachael McEnaney-White | Truck Bed — HARDY |  | low |
| Turnin' Me On | Rachael McEnaney-White | Turnin' Me On — Blake Shelton |  | low |
| Two Black Cadillacs | Rachael McEnaney-White | Two Black Cadillacs — Carrie Underwood |  | low |
| Two-Step Around The Christmas Tree | Traditional | Rockin' Around The Christmas Tree — Brenda Lee |  | low |
| Vamos a Bailar | Séverine Fillion | Vamos a Bailar — Paola & Chiara |  | low |
| Wagon Wheel Rock | Michele Perron | Wagon Wheel — Darius Rucker |  | low |
| Waka Waka | Séverine Fillion | Waka Waka — Shakira |  | low |
| Waltz of the Angels | Kate Sala | Waltz of the Angels — Various |  | low |
| Wasted (Carrie Underwood) | Rachael McEnaney | Wasted — Carrie Underwood |  | low |
| Watermelon Sugar (Line) | Rachael McEnaney-White | Watermelon Sugar — Harry Styles |  | low |
| What Hurts the Most | Rachael McEnaney-White | What Hurts the Most — Rascal Flatts |  | low |
| What Was I Thinkin' | Rob Fowler | What Was I Thinkin' — Dierks Bentley |  | low |
| Where I Come From | Traditional | Where I Come From — Alan Jackson |  | low |
| Whiskey Bent and Hell Bound | Traditional | Whiskey Bent and Hell Bound — Hank Williams Jr. |  | low |
| Whiskey Glasses | Guyton Mundy | Whiskey Glasses — Morgan Wallen |  | low |
| Whiskey in the Jar | Rob Fowler | Whiskey in the Jar — Metallica / The Dubliners |  | low |
| White Christmas | Traditional | White Christmas — Bing Crosby |  | low |
| White Lightning | Traditional | White Lightning — George Jones |  | low |
| Yes I Do | Rachael McEnaney-White | Yes I Do — Rascal Flatts |  | low |

