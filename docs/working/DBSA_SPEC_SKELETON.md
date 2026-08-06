# dAVEBOx SA — Josh's skeleton spec (VERBATIM)

> Source: `dbsa_spec.docx`, uploaded 2026-08-04. **Josh's own words, unedited.**
> He called it "a skeleton... it probably has some gaps, but this is where I want to start."
> Do not silently reinterpret an item — if it is ambiguous, say so and ask.

- Ultimate goal: Make davebox control the entire ui/ux to the extent possible.  
- Expand schwung chains from 4 to 8.
- Create 4 buses (they may already exist), 1 for each move track.  Each has 4 effect slots and a POST insert effects level.  That level is controllable by the volume knob in the same way that schwung instrument levels are controlled within davebox.
- With move instruments on their own audio path, we can use the schwung SLOT volume as the destination for the volume knob/channel knobs in sound mode and session mode.  So we can get rid of the auto-added schwung sound generator level we added.
- Remove all tools but davebox from the host tool menu. Davebox is the only tool that runs in the custom host.
- Find a way to auto-save the schwung host “set” settings at reasonable intervales, especially after a change is made to them (including changes to slot params, module params, etc.)
- Schwung chains 1-8 always receive on channels 1-8
- Move instruments 1-4 always receive on channel 1-4. Their midi out is always set to off.  I want to see if we can find a way to make this happen automatically when db-sa reloads move. Schwung has a feature called set pages that seems to load a different set of sets that are separate from the native ones.  If we could do something similar (essentially having db-sa have its own set of live sets, then we could re-write the set file to have the correct wiring on load and then automatically reload it with the correct settings so it’s not something users have to mess with or even be aware of.  
- HOWEVER, that leaves of the challenge of figuring out HOW users select the set they’re working in.
- Currently, when move reloads under dbsa, the last used set (the last one active before the user loaded dbsa) is loaded automatically.  That’s great, b/c user’s can select the set to work in before loading davebox.  BUT, it means they’re on a set that may not be routed the way db needs it to be.  SO, I’m wondering if, when dbsa loads, part of the loading process is to identify the current set, record the current routings, re-write the set file with desired routings and reload it.  Then, before exit, re-write the routing back to where it was before.)
- The schwung splash screen on host load should be replaced with the randomized davebox splash, BUT should have a small overlay at the bottom that says “Schwung base: [x.x.x.]” indicating the upstream schwung base of the custom host.  Splash should persist until davebox is fully loaded.  
- Host should suppress all leds before davebox loads (or maybe put some kind of cool custom loading animation on the pads).  The idea is to take move native completely out of the user experience EXCEPT for the co-run path in davebox
- Host settings to bake in and remove from settings menu: 
- Move > schwung: always on
- Schwung > link: always on
- Move co-run, track buttons 
- Global menu: add “Suspend to Move” button that suspends to move native.  Remove hold back button to suspend davebox.
- Document any inputs that the host claims for itself while davebox is running and whether they’re consistent with our re-envisioning of the davebox controls everything model we’re working toward.
