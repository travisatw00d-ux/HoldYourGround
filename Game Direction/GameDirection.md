\# Game Structure Redesign



\## Goal

I want the map to remain mostly the same size throughout a run. The variety should come from changing objectives, portal locations, enemy combinations, and increasing difficulty rather than making players travel farther and farther across a growing world.



The game should focus on fast combat, loot, teamwork, risk versus reward, and meaningful decisions.



\---



\# Core Gameplay Loop



The game should rotate through three main phases:



1\. Day

2\. Night

3\. Intermediate Results Phase



The general loop should be:



> Prepare during the day, fight during the night, review the results, then prepare for the next night.



\---



\# Day Phase



The day phase is the team's preparation period.



During the day, players should be able to:



\* Organize and equip loot.

\* Use the shared inventory or Master Chest.

\* Spend shared resources.

\* Upgrade the base.

\* Repair defenses.

\* Heal or revive players if applicable.

\* Prepare for the next night.

\* Review the upcoming threats.

\* Decide when they are ready to begin the next night.



Daytime should be mostly safe.



Its purpose is planning, progression, upgrading, and preparing for the next expedition rather than fighting.



\---



\# Night Phase



Night is the primary combat phase.



Players leave the safety of the base and venture into the world to destroy portals, kill enemies, complete objectives, and collect loot.



Portals should be the main source of enemy spawns during the night.



Some enemies can still spawn naturally around the world so the map never becomes completely empty, but most enemies should originate from portals.



Players should constantly be deciding:



\* Which portal should we attack first?

\* Is it worth pushing farther?

\* Should we split up or stay together?

\* Should someone return to defend the base?

\* Should we destroy another portal or retreat?

\* Are the rewards worth the increasing danger?



\---



\# Ending the Night



The night should not rely on a strict timer that automatically forces players back.



Instead, the night should become increasingly dangerous the longer it continues.



Players should be able to fight for as long as they believe they can survive, but the increasing difficulty should eventually encourage them to retreat.



The team should return to the base when they decide they have pushed far enough.



Once all living players are safely back inside the base, the night can end.



The night should also end if:



\* All players die.

\* The base is destroyed.

\* Another future run-ending condition is triggered.



\---



\# Intermediate Results Phase



After every night, there should be a short intermediate phase before the next day begins.



This phase currently lasts approximately 10 seconds, and I want to keep it.



The main purpose of this phase is to show a statistic and results panel summarizing what happened during the night.



The results panel should show useful information such as:



\* Enemies killed by each player.

\* Total team kills.

\* Damage dealt.

\* Portals destroyed.

\* Bosses or mini-bosses defeated.

\* Gold collected

\* Highest threat level reached.	

\* How long the night lasted.

\* Optional objectives completed.



Not every statistic needs to be implemented immediately, but the system should be structured so more statistics can be added later.



The panel should make individual contributions visible while still emphasizing that the team succeeded or failed together.



After the results phase finishes, the game should transition into the next day phase.



The results phase should not be used for purchasing upgrades or reorganizing equipment. Those activities belong in the day phase.



\---



\# Difficulty Progression



There should be two separate forms of difficulty scaling.



\## Server Level



Server level should continue to determine the baseline strength of enemies.



As the combined player level increases, even basic zombies should become stronger.



I do not want basic enemies to remain equivalent to level-one enemies throughout the run.



Server level should represent the overall progression and strength of the current group.



It should influence things such as:



\* Enemy levels.

\* Enemy health.

\* Enemy damage.

\* Portal durability.

\* Enemy reward quality.



\---



\## Night Threat



Each individual night should gradually become more dangerous the longer the team remains outside.



Night threat is separate from server level.



Server level determines the baseline strength of the world.



Night threat determines how dangerous the current expedition has become.



As night threat increases, the game can increase things such as:



\* Enemy spawn rates.

\* Enemy group sizes.

\* Enemy variety.

\* Elite enemy frequency.

\* Portal spawn production.

\* Base assault pressure.

\* Mini-boss appearances.

\* Overall battlefield chaos.



The goal is for players to eventually decide:



> We have pushed our luck enough. It is time to return to the base.



Retreat should feel like a strategic team decision rather than something caused by an arbitrary countdown.



\---



\# Portals



Portals should become the centerpiece of nighttime gameplay.



Each night, a collection of portals should appear around the map.



Different nights can use different:



\* Portal locations.

\* Portal quantities.

\* Portal strengths.

\* Enemy combinations.

\* Objectives.

\* Threat patterns.



Initially, I only need zombie/troll/goblin portals.



Additional portal types can be added later.



Possible future portal types include:



\* Necromancer rifts.

\* Demon gates.

\* Spider nests.

\* Elite portals.

\* Boss portals.



Destroying a portal should:



\* Stop or reduce enemy production from that location.

\* Reduce pressure on the map.

\* Reduce pressure on the base.

\* Reward the team.

\* Contribute to the night's objectives.

\* Feel immediately meaningful.



Players should feel that destroying portals is more valuable than remaining in one location and endlessly farming enemies.



\---



\# Enemy Spawning



Most nighttime enemies should spawn through active portals.



However, a good number of enemies should still spawn naturally around the world during the night.



These ambient enemies are needed so that:



\* The map never becomes completely safe.

\* Players cannot avoid all danger by staying away from portals.

\* The base can remain under pressure.

\* The world continues feeling active after some portals are destroyed.

\* The night can continue escalating.



Ambient spawning should remain secondary.



Portals should still be the primary and most important source of enemies.



All enemies, including basic ambient zombies, should scale with server level.



\---



\# Base



The base should become the center of the game loop.



Players begin each phase at the base and return there to finish the night.



The base should be upgradeable by the team throughout the run.



Possible upgrades include:



\* Stronger walls/gates

\* Basic defensive structures.

\* Better healing.

\* Better recovery.

\* Improved shared economy.

\* Better portal information.

\* Upgrades that slow nighttime threat progression.

\* Other team-wide improvements.



The base should also be attacked during the night.



Players should not be able to remain inside the base indefinitely without consequences.



There should still be a reason to defend it, but the game should not become primarily a tower-defense game.



The main focus should remain on players leaving the base, fighting enemies, destroying portals, and collecting loot.



Base defenses should assist players rather than replace them.



\---



\# Failure Conditions



The run should end if:



\* All players die.



Individual players may die during a night without immediately ending the run as long as at least one player remains alive and the base is still standing.



The exact revival system can be decided based on the current code and existing game design.



\---



\# Overall Design Philosophy



The intended player experience is:



1\. Prepare during the day.

2\. Begin the night expedition.

3\. Leave the base.

4\. Destroy portals.

5\. Fight increasingly dangerous enemies.

6\. Collect loot and resources.

7\. Decide how much risk to take.

8\. Return to the base before the team is overwhelmed.

9\. Review the night's statistics during the short results phase.

10\. Upgrade and prepare during the next day.

11\. Repeat.



Every night should feel like an expedition where the team balances risk against reward.



The map should remain familiar so players learn it over time.



Runs should still feel different because of changing portal locations, enemy combinations, objectives, threat progression, loot, and team decisions.



The game should reward:



\* Teamwork.

\* Mechanical skill.

\* Good positioning.

\* Portal prioritization.

\* Smart retreat decisions.

\* Efficient combat.

\* Loot choices.

\* Base upgrade decisions.



The game should not rely only on spawning larger health bars or constantly expanding the map.



\---



\# Implementation Guidance



Use this document as the high-level vision for the game rather than an exact technical specification.



Before implementing the redesign:



\* Review the existing codebase.

\* Identify the current phase system.

\* Preserve the existing intermediate phase and adapt it into the results phase.

\* Identify the current enemy spawning system.

\* Identify the current server-level scaling system.

\* Identify the existing player death and game-over rules.

\* Identify systems that can be reused.

\* Propose an architecture that fits the current project.

\* Keep the new systems modular and expandable.

\* Build the redesign incrementally.

\* Avoid replacing every existing system at once.

\* Preserve working combat, movement, networking, loot, inventory, and equipment systems.



The first version should focus on:



\* Day phase.

\* Night phase.

\* Ten-second results phase.

\* One central base.

\* Zombie portals.

\* Limited ambient zombie spawning.

\* Server-level enemy scaling.

\* Increasing nighttime threat.

\* Returning to the base to end the night.

\* Basic nighttime statistics.

\* Game over when all players die or the base is destroyed.



Do not add multiple portal factions or a complicated base-building system until the basic loop is working and fun.



