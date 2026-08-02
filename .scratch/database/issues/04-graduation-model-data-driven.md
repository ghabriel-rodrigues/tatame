# Data-driven graduation model

Type: grilling
Blocked by: 03

## Question

How should the graduation domain be modeled so it is fully data-driven — belt ladders, degrees per belt, lessons-per-degree configurable per academy, kids-belt toggle, black/red belts by dan — such that other belt-based martial arts (judo, karate) can be added later purely by inserting data, with zero schema rewrites? Decide: the ruleset entities (art → belt ladder → belt → degree rules), per-academy overrides vs shared defaults, how a student's current belt/degree and progress (e.g. 28/40 lessons toward next degree) are derived vs stored, and how promotions reference the ruleset.
