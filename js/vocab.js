// FlyHigh - vocabulary lists (flight, airport, weather and travel themed) and question engine
(function () {
  const FH = window.FH, U = FH.util;

  // ROOKIE (Years 3-4 ESL): [word, category, emoji, definition, sentence]
  const ROOKIE = [
    // parts of a plane
    ['wing', 'plane', null, 'the long flat part on each side of a plane that helps it fly', 'A plane has one ___ on each side.'],
    ['tail', 'plane', null, 'the back part of a plane', 'The ___ is at the back of the plane.'],
    ['engine', 'plane', '⚙️', 'the part that gives a plane power to move', 'The ___ makes the propeller spin.'],
    ['propeller', 'plane', null, 'spinning blades at the front of a small plane', 'The ___ spins round and round at the front.'],
    ['wheel', 'plane', '🛞', 'a round thing that rolls on the ground', 'The plane rolls on its ___ on the runway.'],
    ['window', 'plane', '🪟', 'glass in a wall or a plane that you can see through', 'I look out of the ___ and see the clouds.'],
    ['door', 'plane', '🚪', 'you open it to go in or out', 'Close the ___ before the plane takes off.'],
    ['seat', 'plane', '💺', 'a place where you sit', 'Please sit down in your ___.'],
    ['seatbelt', 'plane', null, 'a strap that keeps you safe in your seat', 'Click your ___ before take-off!'],
    ['cockpit', 'plane', null, 'the front room of a plane where the pilot sits', 'The pilot sits in the ___ at the front.'],
    ['fuel', 'plane', '⛽', 'what a plane uses to make its engine work', 'The plane needs more ___ to fly home.'],
    ['radio', 'plane', '📻', 'a machine you use to talk to people far away', 'The pilot talks to the tower on the ___.'],
    // people
    ['pilot', 'people', '🧑‍✈️', 'a person who flies a plane', 'The ___ flies the plane.'],
    ['passenger', 'people', null, 'a person who travels in a plane, bus or car', 'Each ___ has a ticket and a seat.'],
    ['crew', 'people', null, 'the people who work on a plane', 'The ___ help the passengers on the plane.'],
    ['mechanic', 'people', '🧑‍🔧', 'a person who fixes engines and machines', 'The ___ fixes the broken engine.'],
    ['captain', 'people', null, 'the most important pilot on a plane', 'The ___ is in charge of the plane.'],
    ['doctor', 'people', '🧑‍⚕️', 'a person who helps sick people', 'We fly the ___ to the island hospital.'],
    ['farmer', 'people', '🧑‍🌾', 'a person who grows food and keeps animals', 'The ___ waves from the field below.'],
    ['firefighter', 'people', '🧑‍🚒', 'a person who puts out fires', 'The ___ uses water to stop the fire.'],
    ['family', 'people', '👨‍👩‍👧', 'a mum, dad and children together', 'My ___ is flying to the island for a holiday.'],
    // at the airport
    ['airport', 'airport', null, 'a place where planes take off and land', 'We go to the ___ to catch our plane.'],
    ['runway', 'airport', '🛣️', 'a long road where planes take off and land', 'The plane lands on the ___.'],
    ['tower', 'airport', '🗼', 'a tall building where people help planes land safely', 'People in the ___ talk to the pilots.'],
    ['hangar', 'airport', null, 'a big building where planes are kept', 'The plane sleeps in the ___ at night.'],
    ['ticket', 'airport', '🎫', 'a paper that lets you travel', 'Show your ___ to get on the plane.'],
    ['passport', 'airport', null, 'a small book you need to visit another country', 'You need a ___ to fly to another country.'],
    ['suitcase', 'airport', '🧳', 'a big bag for your clothes when you travel', 'I pack my clothes in my ___.'],
    ['map', 'airport', '🗺️', 'a picture that shows where places are', 'The pilot looks at the ___ to find the way.'],
    ['compass', 'airport', '🧭', 'a tool that shows north, south, east and west', 'The ___ needle points north.'],
    ['flag', 'airport', '🚩', 'a piece of cloth with colours that blows in the wind', 'The ___ shows which way the wind blows.'],
    ['clock', 'airport', '🕐', 'it shows us the time', 'Look at the ___. Our plane leaves at three o\'clock.'],
    // sky and weather
    ['sky', 'sky', '🌤️', 'the space above us where birds and planes fly', 'Birds and planes fly in the ___.'],
    ['cloud', 'sky', '☁️', 'a white or grey fluffy shape in the sky', 'The plane flies into a big white ___.'],
    ['sun', 'sky', '☀️', 'the big hot star that gives us daytime', 'The ___ is hot and bright.'],
    ['moon', 'sky', '🌙', 'it shines in the sky at night', 'Pilots can see the ___ at night.'],
    ['star', 'sky', '⭐', 'a small bright light in the night sky', 'I can see a twinkling ___ tonight.'],
    ['rain', 'sky', '🌧️', 'water that falls from the clouds', 'The ___ makes the runway wet.'],
    ['wind', 'sky', '🌬️', 'air that moves fast outside', 'The strong ___ pushes the plane to the side.'],
    ['storm', 'sky', '⛈️', 'very bad weather with strong wind, rain and lightning', 'Fly around the ___. It is dangerous!'],
    ['lightning', 'sky', '⚡', 'a bright flash of light in a storm', 'I saw ___ flash in the dark clouds.'],
    ['thunder', 'sky', null, 'the loud BOOM you hear in a storm', 'The ___ was very loud. BOOM!'],
    ['snow', 'sky', '❄️', 'soft, cold, white ice that falls in winter', 'The mountain top is white with ___.'],
    ['fog', 'sky', '🌫️', 'a thick cloud close to the ground that is hard to see through', 'It is hard to see the runway in the ___.'],
    ['rainbow', 'sky', '🌈', 'a band of colours in the sky after rain', 'We flew past a beautiful ___.'],
    ['weather', 'sky', '🌦️', 'what the sky is like: sunny, rainy, windy or snowy', 'The pilot checks the ___ before every flight.'],
    // places we fly over
    ['island', 'place', '🏝️', 'land with water all around it', 'The plane lands on a small ___ in the sea.'],
    ['ocean', 'place', '🌊', 'a very big area of salty water', 'We fly over the big blue ___.'],
    ['mountain', 'place', '⛰️', 'a very, very high hill', 'Fly higher! There is a tall ___ ahead.'],
    ['forest', 'place', '🌲', 'a place with lots and lots of trees', 'We see green trees in the ___ below.'],
    ['beach', 'place', '🏖️', 'the sandy place next to the sea', 'People swim and play at the ___.'],
    ['river', 'place', '🏞️', 'water that flows across the land to the sea', 'The long ___ flows to the sea.'],
    ['volcano', 'place', '🌋', 'a mountain that can shoot out hot lava', 'Smoke comes out of the ___.'],
    ['lighthouse', 'place', null, 'a tall tower with a bright light to help ships', 'The ___ shines its light at night.'],
    ['castle', 'place', '🏰', 'a big old stone building where kings lived', 'The king and queen live in the ___.'],
    ['windmill', 'place', null, 'a building with big arms that turn in the wind', 'The arms of the ___ turn in the wind.'],
    ['city', 'place', '🏙️', 'a very big town with lots of buildings', 'The ___ has many tall buildings.'],
    ['farm', 'place', null, 'a place where food is grown and animals live', 'Cows and sheep live on the ___.'],
    ['bridge', 'place', '🌉', 'it goes over a river so we can cross', 'Cars drive over the ___.'],
    // flying machines and transport
    ['plane', 'transport', '✈️', 'a machine with wings that flies in the sky', 'The pilot flies the ___.'],
    ['helicopter', 'transport', '🚁', 'a flying machine with spinning blades on top', 'A ___ can fly straight up.'],
    ['jet', 'transport', null, 'a very fast plane with jet engines', 'The ___ zooms across the sky.'],
    ['rocket', 'transport', '🚀', 'it flies very fast into space', 'The ___ goes to the moon.'],
    ['balloon', 'transport', '🎈', 'a big bag of hot air that floats in the sky', 'We float over the fields in a hot-air ___.'],
    ['parachute', 'transport', '🪂', 'a big cloth that helps you fall slowly from the sky', 'He jumps from the plane with a ___.'],
    ['glider', 'transport', null, 'a plane with no engine that floats on the wind', 'A ___ has no engine.'],
    ['drone', 'transport', null, 'a small flying machine with no pilot inside', 'The ___ takes photos from the sky.'],
    ['boat', 'transport', '⛵', 'a small thing that carries people on water', 'We see a ___ sailing on the sea.'],
    ['ship', 'transport', '🚢', 'a very big boat', 'The big ___ crosses the ocean.'],
    ['bus', 'transport', '🚌', 'a long car that carries many people', 'The ___ takes passengers to the plane.'],
    ['truck', 'transport', '🚚', 'a big vehicle that carries heavy things', 'The fuel ___ fills up the plane.'],
    // things we take
    ['helmet', 'thing', '⛑️', 'a hard hat that keeps your head safe', 'The pilot wears a ___ on her head.'],
    ['headphones', 'thing', '🎧', 'you wear them on your ears to listen', 'The pilot wears ___ to hear the radio.'],
    ['camera', 'thing', '📷', 'it takes photos', 'Take a photo of the island with the ___.'],
    ['binoculars', 'thing', null, 'you look through them to see things far away', 'Look through the ___ to find the boat.'],
    ['umbrella', 'thing', '☂️', 'it keeps you dry in the rain', 'Open your ___ in the rain.'],
    ['sunglasses', 'thing', '🕶️', 'dark glasses that protect your eyes from the sun', 'Pilots wear ___ on sunny days.'],
    ['backpack', 'thing', '🎒', 'a bag you carry on your back', 'My snacks are in my ___.'],
    ['medicine', 'thing', '💊', 'something you take to get better when you are sick', 'We fly the ___ to the hospital.'],
    ['letter', 'thing', '✉️', 'a message on paper that you send to someone', 'The plane carries a ___ to Grandma.'],
    ['box', 'thing', '📦', 'something to keep things in', 'Put the toys in the ___.'],
    ['food', 'thing', '🍱', 'what we eat', 'The plane carries ___ for the people on the island.'],
    ['water', 'thing', '💧', 'a clear drink that also falls as rain', 'The pilot drinks some ___.'],
    // describing words
    ['fast', 'describe', '💨', 'moving very quickly', 'A jet plane is very ___.'],
    ['slow', 'describe', '🐌', 'not fast', 'A snail is very ___.'],
    ['high', 'describe', null, 'far up from the ground', 'The plane flies very ___ in the sky.'],
    ['low', 'describe', null, 'near the ground; not high', 'Fly ___ so you can see the boat.'],
    ['big', 'describe', '🐘', 'very large, not small', 'The jumbo jet is very ___.'],
    ['small', 'describe', '🐭', 'little, not big', 'My toy plane is very ___.'],
    ['loud', 'describe', '📢', 'making a big noise', 'The jet engine is very ___.'],
    ['quiet', 'describe', '🤫', 'making very little noise', 'Please be ___ in the library.'],
    ['safe', 'describe', null, 'not in danger', 'Wear your seatbelt to stay ___.'],
    ['dangerous', 'describe', '⚠️', 'could hurt you; not safe', 'Flying into a storm is ___.'],
    ['windy', 'describe', null, 'with lots of strong wind', 'It is very ___ today. Hold on!'],
    ['sunny', 'describe', '😎', 'bright, with lots of sunshine', 'It is a ___ day. Wear your sunglasses!'],
    ['cold', 'describe', '🥶', 'not warm, like ice', 'It is ___ at the top of the mountain.'],
    ['hot', 'describe', '🔥', 'very, very warm', 'The desert is very ___.'],
    ['happy', 'describe', '😀', 'feeling good and smiling', 'I am ___ to fly today!'],
    ['scared', 'describe', '😱', 'afraid of something', 'I am ___ of the thunder.'],
    ['tired', 'describe', '😴', 'needing to sleep or rest', 'The pilot is ___ after a long flight.'],
    ['heavy', 'describe', '🏋️', 'hard to lift up', 'The big suitcase is very ___.'],
    ['empty', 'describe', null, 'with nothing inside', 'The fuel tank is ___. We need more fuel!'],
    ['full', 'describe', null, 'with no more space inside', 'The plane is ___ of passengers.'],
    ['bumpy', 'describe', null, 'moving up and down, not smooth', 'The flight is ___ in the windy weather.'],
    // actions
    ['fly', 'action', null, 'to move through the air', 'Birds and planes can ___.'],
    ['take off', 'action', '🛫', 'to leave the ground and go up into the air', 'The plane will ___ from the runway.'],
    ['land', 'action', '🛬', 'to come down to the ground from the air', 'The plane will ___ on the runway.'],
    ['climb', 'action', '📈', 'to go up higher', 'Pull back to ___ above the mountain.'],
    ['turn', 'action', '↪️', 'to change the way you are going', '___ left at the lighthouse.'],
    ['steer', 'action', null, 'to make a plane, car or boat go the way you want', 'The pilot can ___ the plane left and right.'],
    ['look', 'action', '👀', 'to use your eyes to see', '___ out of the window at the island!'],
    ['listen', 'action', '👂', 'to use your ears to hear', '___ to the tower on the radio.'],
    ['wait', 'action', '⏳', 'to stay until something happens', 'Please ___ for the plane in front.'],
    ['carry', 'action', null, 'to hold something and take it with you', 'Big planes ___ lots of bags.'],
    ['pack', 'action', null, 'to put things in a bag or box', 'I ___ my suitcase for the trip.'],
    ['help', 'action', '🆘', 'to make things easier for someone', 'The helicopter came to ___ the sailors.'],
    ['wave', 'action', '👋', 'to move your hand to say hello or goodbye', '___ goodbye to your family.'],
    ['find', 'action', '🔍', 'to see something you were looking for', 'Can you ___ the lost boat?'],
    ['check', 'action', '✅', 'to look carefully to make sure something is right', 'Pilots ___ the plane before every flight.'],
    ['stop', 'action', '🛑', 'to not move any more', '___ the plane at the end of the runway.'],
    ['travel', 'action', null, 'to go from one place to another', 'We ___ by plane to another country.'],
    ['swim', 'action', '🏊', 'to move through water with arms and legs', 'The dolphins ___ in the sea.'],
    ['sleep', 'action', '🛌', 'to rest with your eyes closed', 'I ___ on the long flight.'],
    ['eat', 'action', '🍽️', 'to put food in your mouth', 'We ___ lunch on the plane.'],
    // directions
    ['up', 'direction', '⬆️', 'toward the sky', 'The plane goes ___ into the sky.'],
    ['down', 'direction', '⬇️', 'toward the ground', 'The plane comes ___ to land.'],
    ['left', 'direction', '⬅️', 'the opposite of right', 'Turn ___ at the big tree.'],
    ['right', 'direction', '➡️', 'the opposite of left', 'Turn ___ at the lighthouse.'],
    ['north', 'direction', null, 'the direction at the top of a map', 'On a map, ___ is at the top.'],
    ['south', 'direction', null, 'the direction at the bottom of a map', 'On a map, ___ is at the bottom.'],
    ['east', 'direction', null, 'the direction where the sun comes up', 'The sun comes up in the ___.'],
    ['west', 'direction', null, 'the direction where the sun goes down', 'The sun goes down in the ___.'],
    ['above', 'direction', null, 'higher than something', 'The plane is ___ the clouds.'],
    ['below', 'direction', null, 'lower than something', 'The fish swim ___ the boat.'],
    ['near', 'direction', null, 'not far away; close', 'The airport is ___ the beach.'],
    ['far', 'direction', null, 'a long way away', 'The moon is very ___ away.'],
    ['over', 'direction', null, 'across the top of something', 'We fly ___ the mountains.'],
    ['around', 'direction', null, 'in a circle, or on every side of something', 'Fly ___ the storm, not into it.'],
  ];

  // NORMAL (Year 6): [word, category, definition, synonym, antonym, sentence]
  const NORMAL = [
    // describing flight and weather
    ['airborne', 'adj', 'flying in the air', 'aloft', 'grounded', 'Once the plane was ___, the passengers relaxed.'],
    ['turbulent', 'adj', 'moving roughly and unevenly; bumpy', 'rough', 'calm', 'The ___ air shook the small plane.'],
    ['overcast', 'adj', 'covered with grey clouds', 'cloudy', 'clear', 'The sky was ___, so we could not see the sun.'],
    ['gusty', 'adj', 'with sudden strong blasts of wind', 'blustery', 'still', 'A ___ wind blew the windsock in every direction.'],
    ['hazardous', 'adj', 'dangerous or risky', 'dangerous', 'safe', 'Flying into a thunderstorm is ___.'],
    ['visible', 'adj', 'able to be seen', 'noticeable', 'invisible', 'The runway lights were ___ through the rain.'],
    ['cautious', 'adj', 'careful to avoid danger or mistakes', 'careful', 'reckless', 'A ___ pilot checks the weather before take-off.'],
    ['steady', 'adj', 'firm and not shaking or changing', 'stable', 'unsteady', 'Keep the wings ___ during the landing.'],
    ['rapid', 'adj', 'happening very quickly', 'swift', 'slow', 'The jet made a ___ climb into the sky.'],
    ['gradual', 'adj', 'happening slowly, little by little', 'gentle', 'sudden', 'The plane made a ___ descent toward the airport.'],
    ['remote', 'adj', 'far away from towns and people', 'isolated', 'nearby', 'Only a small plane can reach the ___ island.'],
    ['vast', 'adj', 'extremely large in area', 'immense', 'tiny', 'The ___ ocean stretched all the way to the horizon.'],
    ['steep', 'adj', 'rising or falling very sharply', 'sheer', 'shallow', 'The plane made a ___ climb to clear the mountain.'],
    ['dense', 'adj', 'closely packed together; thick', 'thick', 'sparse', 'The ___ fog made it hard to see the runway.'],
    ['accurate', 'adj', 'correct in every detail', 'precise', 'inaccurate', 'The navigator gave an ___ position on the map.'],
    ['reliable', 'adj', 'able to be trusted to work well', 'dependable', 'unreliable', 'A ___ engine is important for every plane.'],
    ['spectacular', 'adj', 'amazing and exciting to see', 'stunning', 'dull', 'The view of the volcano from the air was ___.'],
    ['courageous', 'adj', 'brave; not afraid of danger', 'brave', 'cowardly', 'The ___ rescue pilot flew through the storm.'],
    ['anxious', 'adj', 'worried or nervous', 'nervous', 'relaxed', 'She felt ___ before her first flight.'],
    ['alert', 'adj', 'quick to notice things; wide awake', 'attentive', 'drowsy', 'Pilots must stay ___ during the whole flight.'],
    ['punctual', 'adj', 'arriving exactly on time', 'on time', 'late', 'Our flight was ___ and landed at exactly nine o\'clock.'],
    ['delayed', 'adj', 'later than planned', 'late', 'early', 'The flight was ___ because of the storm.'],
    ['international', 'adj', 'between two or more countries', 'global', 'domestic', 'Big jets make long ___ flights across the ocean.'],
    ['horizontal', 'adj', 'flat and level, from side to side', 'level', 'vertical', 'Keep the wings ___ when you fly straight.'],
    ['vertical', 'adj', 'going straight up and down', 'upright', 'horizontal', 'A helicopter can make a ___ take-off.'],
    ['fragile', 'adj', 'easily broken or damaged', 'delicate', 'sturdy', 'Pack the ___ cargo very carefully.'],
    ['magnificent', 'adj', 'extremely beautiful and impressive', 'splendid', 'plain', 'The sunrise above the clouds was ___.'],
    // flying verbs
    ['ascend', 'verb', 'to go up or climb', 'rise', 'descend', 'The plane began to ___ above the clouds.'],
    ['descend', 'verb', 'to go down', 'drop', 'ascend', 'We will ___ slowly toward the runway.'],
    ['accelerate', 'verb', 'to go faster', 'speed up', 'decelerate', 'Push the throttle to ___ down the runway.'],
    ['decelerate', 'verb', 'to slow down', 'slow down', 'accelerate', 'Use the brakes to ___ after landing.'],
    ['navigate', 'verb', 'to find the way to a place', 'steer', null, 'Pilots use a compass to ___ across the ocean.'],
    ['hover', 'verb', 'to stay in one place in the air', 'float', null, 'The helicopter can ___ above the ship.'],
    ['soar', 'verb', 'to fly high in the sky', 'glide', 'plunge', 'Eagles ___ high above the mountains.'],
    ['glide', 'verb', 'to fly smoothly without engine power', 'coast', null, 'With no fuel, the plane had to ___ to the runway.'],
    ['plummet', 'verb', 'to fall very quickly', 'plunge', 'rise', 'The temperature can ___ at high altitude.'],
    ['cruise', 'verb', 'to travel at a steady, comfortable speed', 'coast', null, 'The jet will ___ at 35,000 feet.'],
    ['transport', 'verb', 'to carry people or goods from one place to another', 'carry', null, 'Cargo planes ___ goods around the world.'],
    ['rescue', 'verb', 'to save someone from danger', 'save', 'abandon', 'The helicopter came to ___ the lost sailors.'],
    ['evacuate', 'verb', 'to leave a dangerous place quickly', 'leave', null, 'People had to ___ the town near the volcano.'],
    ['divert', 'verb', 'to change direction or go to a different place', 'redirect', null, 'The storm forced the pilot to ___ to another airport.'],
    ['approach', 'verb', 'to come near to something', 'near', 'retreat', 'The pilot slowed down to ___ the runway.'],
    ['depart', 'verb', 'to leave, especially to start a journey', 'leave', 'arrive', 'Our flight will ___ at nine o\'clock.'],
    ['arrive', 'verb', 'to reach a place', 'reach', 'depart', 'We will ___ at the island before lunch.'],
    ['communicate', 'verb', 'to share information with others', 'talk', null, 'Pilots ___ with air traffic control by radio.'],
    ['maintain', 'verb', 'to keep something the same', 'keep', 'change', 'Please ___ your altitude at 3,000 feet.'],
    ['inspect', 'verb', 'to look at something very closely to check it', 'examine', null, 'The mechanic will ___ the engine before the flight.'],
    ['refuel', 'verb', 'to fill something up with fuel again', 'fill up', null, 'We must land and ___ before flying home.'],
    ['monitor', 'verb', 'to watch or check something over a period of time', 'observe', null, 'Controllers ___ every plane on their radar screens.'],
    ['estimate', 'verb', 'to make a careful guess about an amount', 'guess', null, 'Can you ___ how far away the island is?'],
    ['predict', 'verb', 'to say what will happen in the future', 'forecast', null, 'Experts ___ that it will rain tomorrow.'],
    ['observe', 'verb', 'to watch something carefully', 'watch', 'ignore', 'Scientists ___ the volcano from the air.'],
    ['explore', 'verb', 'to travel around a place to learn about it', 'discover', null, 'We want to ___ the secret island.'],
    ['announce', 'verb', 'to tell everyone something officially', 'declare', null, 'The captain will ___ when we are about to land.'],
    ['board', 'verb', 'to get on a plane, ship or train', 'embark', 'disembark', 'Passengers can ___ the plane through gate 5.'],
    ['abandon', 'verb', 'to leave something or someone behind forever', 'desert', 'keep', 'The sailors had to ___ the sinking ship.'],
    ['hesitate', 'verb', 'to pause before doing something because you are unsure', 'pause', null, 'Do not ___ to call for help on the radio.'],
    ['survive', 'verb', 'to stay alive through a dangerous time', 'endure', null, 'The crew managed to ___ the storm.'],
    // aircraft and airport
    ['altitude', 'flight', 'the height of something above sea level', 'height', null, 'The plane climbed to an ___ of 3,000 feet.'],
    ['runway', 'flight', 'a long, flat strip where planes take off and land', 'airstrip', null, 'The plane landed safely on the ___.'],
    ['cockpit', 'flight', 'the part of a plane where the pilot sits', 'flight deck', null, 'The pilot sat in the ___ and checked the controls.'],
    ['propeller', 'flight', 'spinning blades that pull a plane forward', null, null, 'The ___ spun faster and faster.'],
    ['hangar', 'flight', 'a large building where planes are kept and repaired', null, null, 'The plane stays in the ___ at night.'],
    ['fuselage', 'flight', 'the main body of an aeroplane', null, null, 'Passengers sit inside the ___ of the plane.'],
    ['throttle', 'flight', 'the control that changes engine power', null, null, 'Push the ___ forward to go faster.'],
    ['heading', 'flight', 'the direction that a plane is pointing', null, null, 'Turn the plane to a ___ of 270 degrees.'],
    ['control tower', 'flight', 'the building where air traffic controllers work', null, null, 'The ___ told the pilot it was safe to land.'],
    ['wingspan', 'flight', 'the distance from one wingtip to the other', null, null, 'The giant jet has a huge ___.'],
    ['aviator', 'flight', 'a person who flies aircraft; a pilot', 'pilot', null, 'Amelia Earhart was a famous ___.'],
    ['take-off', 'flight', 'the moment a plane leaves the ground', 'lift-off', 'landing', 'Hold on tight during ___!'],
    ['cabin', 'flight', 'the part of a plane where the passengers sit', null, null, 'The ___ crew served drinks to the passengers.'],
    ['crew', 'flight', 'the people who work on a plane or ship', 'team', null, 'The ___ checked that every seatbelt was fastened.'],
    ['autopilot', 'flight', 'a system that flies the plane automatically', null, null, 'On long flights, the pilot turns on the ___.'],
    ['landing gear', 'flight', 'the wheels and legs a plane lands on', null, null, 'Lower the ___ before you land!'],
    ['rudder', 'flight', 'the moving part on the tail that turns the nose left or right', null, null, 'Press the pedals to move the ___.'],
    ['aileron', 'flight', 'a moving part on the wing that makes the plane roll', null, null, 'The pilot moved the ___ to bank the plane.'],
    ['radar', 'flight', 'a system that uses radio waves to find planes and storms', null, null, 'The storm showed up as a red area on the ___.'],
    ['terminal', 'flight', 'the airport building where passengers wait for their flights', null, null, 'We waited in the ___ until our flight was called.'],
    ['departure', 'flight', 'the act of leaving, especially on a journey', 'leaving', 'arrival', 'Our ___ was delayed by one hour.'],
    ['arrival', 'flight', 'the act of reaching a place', 'coming', 'departure', 'The board shows the ___ time of each flight.'],
    ['passenger', 'flight', 'a person travelling in a vehicle who is not the driver', 'traveller', null, 'Every ___ must wear a seatbelt.'],
    ['cargo', 'flight', 'goods carried by a ship, plane or truck', 'freight', null, 'The plane carried a load of ___ to the island.'],
    ['destination', 'flight', 'the place where someone is going', 'goal', 'origin', 'Our ___ is the airport on Palm Island.'],
    ['navigation', 'flight', 'finding your way from one place to another', null, null, 'Good ___ helps pilots find the right airport.'],
    ['airspace', 'flight', 'the part of the sky above a country or area', null, null, 'The jet entered Australian ___.'],
    ['emergency', 'flight', 'a sudden, dangerous situation that needs fast action', 'crisis', null, 'In an ___, call for help on the radio.'],
    // weather and the sky
    ['turbulence', 'weather', 'rough, bumpy air that shakes a plane', null, null, 'Fasten your seatbelt because of the ___.'],
    ['visibility', 'weather', 'how far you can see clearly', null, null, 'The thick fog made ___ very poor.'],
    ['forecast', 'weather', 'a report saying what the weather will be like', 'prediction', null, 'The weather ___ says it will be windy.'],
    ['thunderstorm', 'weather', 'a storm with thunder, lightning and heavy rain', null, null, 'The pilot flew around the ___.'],
    ['gust', 'weather', 'a sudden strong rush of wind', 'blast', null, 'A ___ of wind pushed the plane sideways.'],
    ['crosswind', 'weather', 'a wind blowing across the runway from the side', null, null, 'Landing in a strong ___ is tricky.'],
    ['precipitation', 'weather', 'rain, snow, sleet or hail that falls from the sky', null, null, 'The forecast predicts heavy ___ tonight.'],
    ['humidity', 'weather', 'the amount of water in the air', 'moisture', null, 'High ___ makes the air feel sticky.'],
    ['temperature', 'weather', 'how hot or cold something is', null, null, 'The ___ drops as you fly higher.'],
    ['atmosphere', 'weather', 'the layer of air around the Earth', 'air', null, 'Planes fly through the Earth\'s ___.'],
    ['horizon', 'weather', 'the line where the sky seems to meet the land or sea', 'skyline', null, 'The sun disappeared below the ___.'],
    ['climate', 'weather', 'the usual weather in a place over a long time', null, null, 'The tropical ___ is warm all year.'],
    // the science of flight
    ['thrust', 'science', 'the force that pushes a plane forward', null, 'drag', 'The jet engines give the plane ___.'],
    ['drag', 'science', 'the force of air that slows a moving object down', 'resistance', 'thrust', 'A smooth shape helps reduce ___.'],
    ['lift', 'science', 'the upward force made by the wings', null, null, 'Air flowing over the wings creates ___.'],
    ['gravity', 'science', 'the force that pulls things down toward the Earth', null, null, '___ pulls the plane down toward the ground.'],
    ['velocity', 'science', 'the speed of something in a certain direction', 'speed', null, 'The jet reached a ___ of 800 kilometres per hour.'],
    ['pressure', 'science', 'the force of something pushing on something else', null, null, 'Air ___ is lower high up in the sky.'],
    ['satellite', 'science', 'an object that travels around a planet in space', null, null, 'A ___ sends weather pictures from space.'],
    ['friction', 'science', 'the force that slows things when they rub together', null, null, 'The brakes use ___ to stop the wheels.'],
    // places seen from the air
    ['archipelago', 'noun', 'a group of islands', null, null, 'We flew over an ___ of seven islands.'],
    ['peninsula', 'noun', 'land that is almost surrounded by water', null, null, 'The town is on a narrow ___ with sea on three sides.'],
    ['coastline', 'noun', 'the land along the edge of the sea', 'shore', null, 'We followed the ___ to find the lighthouse.'],
    ['summit', 'noun', 'the highest point of a mountain', 'peak', 'base', 'The plane flew just above the ___ of the mountain.'],
    ['valley', 'noun', 'low land between hills or mountains', null, null, 'A river flows through the green ___.'],
    ['lagoon', 'noun', 'a shallow lake of sea water next to the sea', null, null, 'The seaplane landed on the calm blue ___.'],
    ['harbour', 'noun', 'a sheltered area of water where ships stay', 'port', null, 'The fishing boats returned to the ___.'],
    ['eruption', 'noun', 'when a volcano explodes and lava comes out', 'explosion', null, 'The volcano\'s ___ sent ash high into the sky.'],
    ['voyage', 'noun', 'a long journey, especially by sea or in space', 'journey', null, 'The ___ across the ocean took three weeks.'],
    ['compass', 'noun', 'a tool that shows which direction is north', null, null, 'The ___ needle always points north.'],
    ['landmark', 'noun', 'an object or building that is easy to see and recognise', null, null, 'The tall lighthouse is a famous ___.'],
  ];

  // Groups of words that are too close in meaning to appear together as options
  const CONF_R = [['plane', 'jet', 'glider', 'fly'], ['boat', 'ship'], ['up', 'above', 'climb', 'high', 'take off'], ['down', 'below', 'low', 'land'],
    ['sun', 'star', 'sunny', 'hot'], ['cloud', 'rain', 'fog', 'sky', 'weather'], ['storm', 'lightning', 'thunder', 'rain', 'windy', 'wind'],
    ['big', 'heavy'], ['pilot', 'captain', 'crew'], ['cockpit', 'seat', 'seatbelt'], ['airport', 'runway', 'hangar', 'tower'],
    ['ocean', 'river', 'beach', 'island', 'water'], ['truck', 'bus'], ['look', 'find', 'check'], ['take off', 'fly', 'climb'],
    ['turn', 'steer'], ['map', 'compass'], ['cold', 'snow'], ['near', 'around', 'over'], ['helicopter', 'drone'],
    ['passenger', 'family', 'crew'], ['ticket', 'passport'], ['empty', 'full'], ['carry', 'pack'], ['bumpy', 'windy'], ['fast', 'jet', 'rocket'],
    ['scared', 'dangerous'], ['suitcase', 'backpack', 'box'], ['stop', 'wait'], ['lighthouse', 'tower'], ['mechanic', 'engine'],
    ['travel', 'fly'], ['tired', 'sleep'], ['helmet', 'headphones'], ['camera', 'binoculars'], ['farm', 'farmer'], ['city', 'bridge']];
  const CONF_N = [['ascend', 'soar', 'hover', 'airborne'], ['descend', 'plummet', 'glide'], ['accelerate', 'rapid', 'thrust'],
    ['navigate', 'divert', 'navigation', 'explore', 'heading'], ['observe', 'monitor', 'inspect'], ['predict', 'estimate', 'forecast'],
    ['depart', 'evacuate', 'abandon', 'departure', 'board'], ['arrive', 'approach', 'arrival', 'destination'],
    ['turbulent', 'gusty', 'turbulence', 'gust', 'crosswind'], ['overcast', 'dense', 'visibility'], ['hazardous', 'emergency'],
    ['vast', 'magnificent', 'spectacular'], ['steep', 'rapid'], ['cautious', 'alert', 'anxious'], ['punctual', 'delayed'],
    ['horizontal', 'vertical', 'steady'], ['thrust', 'lift', 'drag', 'gravity', 'pressure', 'friction', 'velocity'],
    ['climate', 'temperature', 'humidity', 'atmosphere', 'forecast', 'precipitation'], ['coastline', 'harbour', 'peninsula', 'lagoon', 'archipelago'],
    ['summit', 'altitude'], ['aviator', 'crew', 'cockpit', 'cabin', 'passenger'], ['rudder', 'aileron', 'throttle'],
    ['runway', 'terminal', 'hangar', 'control tower'], ['cargo', 'transport', 'passenger'], ['take-off', 'departure'],
    ['landmark', 'compass'], ['thunderstorm', 'precipitation', 'turbulence'], ['maintain', 'cruise'], ['refuel', 'board'],
    ['radar', 'monitor'], ['airspace', 'atmosphere'], ['rescue', 'survive'], ['decelerate', 'glide']];

  const CLS = {
    plane: 'n', people: 'n', airport: 'n', sky: 'n', place: 'n', transport: 'n', thing: 'n', describe: 'a', action: 'v', direction: 'd',
    adj: 'a', verb: 'v', noun: 'n', flight: 'n', weather: 'n', science: 'n',
  };

  const RK = ROOKIE.map(r => ({ w: r[0], cat: r[1], e: r[2], d: r[3], s: r[4], cls: CLS[r[1]] }));
  const NM = NORMAL.map(r => ({ w: r[0], cat: r[1], d: r[2], syn: r[3], ant: r[4], s: r[5], cls: CLS[r[1]] }));

  function buildConf(groups) {
    const m = {};
    groups.forEach((g, i) => g.forEach(w => { (m[w] = m[w] || []).push(i); }));
    return m;
  }

  const V = FH.Vocab = {
    ROOKIE: RK, NORMAL: NM,
    init(mode, stats) {
      this.mode = mode; this.rookie = mode === 'rookie';
      this.list = this.rookie ? RK : NM;
      this.stats = stats; this.recent = [];
      this.conf = buildConf(this.rookie ? CONF_R : CONF_N);
    },
    confusable(a, b) {
      const ga = this.conf[a], gb = this.conf[b];
      if (!ga || !gb) return false;
      return ga.some(g => gb.includes(g));
    },
    weightOf(e) {
      const s = this.stats[e.w];
      if (!s) return 2.2;
      let w = 1 + s.w * 1.2 - Math.min(s.c, 6) * 0.14;
      if (s.last === 0) w += 2;
      return Math.max(0.2, w);
    },
    pick(filter) {
      const pool = this.list.filter(e => !this.recent.includes(e.w) && (!filter || filter(e)));
      if (!pool.length) return U.pick(this.list);
      return U.weighted(pool.map(e => [e, this.weightOf(e)]));
    },
    record(word, ok) {
      const s = this.stats[word] || (this.stats[word] = { c: 0, w: 0, last: -1 });
      if (ok) { s.c++; s.last = 1; } else { s.w++; s.last = 0; }
    },
    stars(word) {
      const s = this.stats[word];
      if (!s) return 0;
      const net = s.c - s.w * 0.5;
      return net >= 4 ? 3 : net >= 2 ? 2 : net >= 0.5 ? 1 : 0;
    },
    entry(word) { return this.list.find(e => e.w === word); },
    pool(e, filter, count, mapFn, exclude = []) {
      const cands = U.shuffle(this.list.filter(x => x.w !== e.w && filter(x)));
      const out = [];
      for (const x of cands) {
        const v = mapFn(x);
        if (v && !out.includes(v) && !exclude.includes(v)) out.push(v);
        if (out.length >= count) break;
      }
      return out;
    },
    fillSentence(e) {
      const s = e.s.replace('___', e.w);
      return U.cap(s);
    },
    question(opts = {}) {
      const gate = !!opts.gate;
      const n = gate ? 3 : (this.rookie ? 3 : 4);
      for (let tries = 0; tries < 15; tries++) {
        const e = this.pick();
        const types = [];
        if (this.rookie) {
          if (e.e) types.push('emoji', 'emoji');
          types.push('def', 'fill');
          if (!gate) types.push('fill');
        } else {
          types.push('def', 'fill');
          if (e.syn) types.push('syn');
          if (e.ant) types.push('ant', 'ant');
          if (!gate) types.push('meaning');
        }
        const t = U.pick(types);
        const notConf = x => !this.confusable(x.w, e.w);
        let q = null;
        if (t === 'emoji') {
          let ds = this.pool(e, x => x.cat === e.cat && x.e && notConf(x), n - 1, x => x.w);
          if (ds.length < n - 1) ds = ds.concat(this.pool(e, x => x.e && notConf(x), n - 1 - ds.length, x => x.w, ds));
          if (ds.length < n - 1) continue;
          q = { prompt: 'Which word is this?', emoji: e.e, answer: e.w, options: [e.w, ...ds], speak: 'Which word is this?' };
        } else if (t === 'def') {
          const same = this.rookie ? (x => x.cat === e.cat) : (x => x.cls === e.cls);
          let ds = this.pool(e, x => same(x) && notConf(x), n - 1, x => x.w);
          if (ds.length < n - 1) ds = ds.concat(this.pool(e, notConf, n - 1 - ds.length, x => x.w, ds));
          if (ds.length < n - 1) continue;
          q = { prompt: `Which word means: “${e.d}”?`, answer: e.w, options: [e.w, ...ds], speak: `Which word means: ${e.d}?` };
        } else if (t === 'fill') {
          const ds = this.pool(e, x => x.cls !== e.cls, n - 1, x => x.w);
          if (ds.length < n - 1) continue;
          const shown = e.s.replace('___', '_____');
          q = { prompt: shown, answer: e.w, options: [e.w, ...ds], speak: e.s.replace('___', 'blank'), fill: true };
        } else if (t === 'syn') {
          const ds = [];
          if (e.ant) ds.push(e.ant);
          const more = this.pool(e, x => x.cls !== e.cls, n - 1 - ds.length, x => x.w, [e.syn, e.ant]);
          ds.push(...more);
          if (ds.length < n - 1) continue;
          q = { prompt: `Which word means the SAME as “${e.w}”?`, answer: e.syn, options: [e.syn, ...ds.slice(0, n - 1)], speak: `Which word means the same as ${e.w}?` };
        } else if (t === 'ant') {
          const ds = [];
          if (e.syn) ds.push(e.syn);
          const more = this.pool(e, x => x.cls !== e.cls, n - 1 - ds.length, x => x.w, [e.syn, e.ant]);
          ds.push(...more);
          if (ds.length < n - 1) continue;
          q = { prompt: `Which word is the OPPOSITE of “${e.w}”?`, answer: e.ant, options: [e.ant, ...ds.slice(0, n - 1)], speak: `Which word is the opposite of ${e.w}?` };
        } else if (t === 'meaning') {
          const ds = this.pool(e, x => x.cls === e.cls && notConf(x), n - 1, x => x.d);
          if (ds.length < n - 1) continue;
          q = { prompt: `What does “${e.w}” mean?`, answer: e.d, options: [e.d, ...ds], speak: `What does ${e.w} mean?`, long: true };
        }
        if (!q) continue;
        q.type = t; q.word = e.w; q.entry = e;
        q.options = U.shuffle(q.options.slice());
        let ex = `${U.cap(e.w)} — ${e.d}.`;
        if (e.syn && !this.rookie) ex += ` (Same: ${e.syn}${e.ant ? ` · Opposite: ${e.ant}` : ''})`;
        q.explain = ex;
        q.example = this.fillSentence(e);
        this.recent.push(e.w);
        if (this.recent.length > 10) this.recent.shift();
        return q;
      }
      return null;
    },
  };
})();
