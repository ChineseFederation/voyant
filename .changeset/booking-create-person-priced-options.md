---
"@voyant-travel/bookings-react": patch
---

Stop labelling person-priced booking options as sold out. The manual booking create form showed "room is full" on an option whose per-unit capacity is uncapped but whose departure has finite capacity, so operators never touched the stepper and Create booking stayed disabled behind an unclearable "Select at least one option.". The label now states that the row draws on the departure's capacity, the Options section is marked required and carries the validation message and focus on a failed submit, blocking messages clear as soon as submit is possible again, and unit quantities are reset on the selected departure/option rather than on every refetch of the slots query.
