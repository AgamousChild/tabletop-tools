# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: brain.spec.ts >> Brain — Search tab >> faction banner dismiss shows all results but keeps sort
- Location: specs\brain.spec.ts:87:7

# Error details

```
Error: expect(locator).not.toBeVisible() failed

Locator:  getByText(/Filtered to/)
Expected: not visible
Received: visible
Timeout:  5000ms

Call log:
  - Expect "not toBeVisible" with timeout 5000ms
  - waiting for getByText(/Filtered to/)
    9 × locator resolved to <span class="text-xs text-amber-400">Filtered to blood angels</span>
      - unexpected value "visible"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - heading "40K Brain" [level=1] [ref=e6]
      - generic [ref=e7]:
        - button "Ask" [ref=e8] [cursor=pointer]
        - button "Search" [ref=e9] [cursor=pointer]
        - button "Browse" [ref=e10] [cursor=pointer]
        - button "Graph" [ref=e11] [cursor=pointer]
  - main [ref=e13]:
    - generic [ref=e14]:
      - generic [ref=e15]:
        - textbox "Semantic search across all rules..." [ref=e16]: blood angels
        - button "Search" [ref=e17] [cursor=pointer]
      - generic [ref=e18]:
        - generic [ref=e19]: Filtered to blood angels
        - button "Show all results" [active] [ref=e20] [cursor=pointer]
      - generic [ref=e21]:
        - generic [ref=e22]:
          - generic [ref=e23]:
            - generic [ref=e24]:
              - generic [ref=e25]: "#1"
              - heading "Angelic Inheritors" [level=3] [ref=e26]
            - generic [ref=e27]: 100%
          - generic [ref=e28]:
            - generic [ref=e29]: faction
            - generic [ref=e30]: detachment-rule
            - generic [ref=e31]: space-marines
            - generic [ref=e32]: blood angels
          - paragraph [ref=e33]: Angelic Inheritors detachment for space-marines [Blood Angels only]. Legacy of the Angel
        - generic [ref=e34]:
          - generic [ref=e35]:
            - generic [ref=e36]:
              - generic [ref=e37]: "#2"
              - heading "Rage-cursed Onslaught" [level=3] [ref=e38]
            - generic [ref=e39]: 100%
          - generic [ref=e40]:
            - generic [ref=e41]: faction
            - generic [ref=e42]: detachment-rule
            - generic [ref=e43]: space-marines
            - generic [ref=e44]: blood angels
          - paragraph [ref=e45]: Rage-cursed Onslaught detachment for space-marines [Blood Angels only]. Maddened Ferocity
        - generic [ref=e46]:
          - generic [ref=e47]:
            - generic [ref=e48]:
              - generic [ref=e49]: "#3"
              - heading "Astorath" [level=3] [ref=e50]
            - generic [ref=e51]: 100%
          - generic [ref=e52]:
            - generic [ref=e53]: unit
            - generic [ref=e54]: datasheet
            - generic [ref=e55]: space-marines
            - generic [ref=e56]: blood angels
          - paragraph [ref=e57]: "Astorath — Characters, 1 model: 85pts."
        - generic [ref=e58]:
          - generic [ref=e59]:
            - generic [ref=e60]:
              - generic [ref=e61]: "#4"
              - heading "Baal Predator" [level=3] [ref=e62]
            - generic [ref=e63]: 100%
          - generic [ref=e64]:
            - generic [ref=e65]: unit
            - generic [ref=e66]: datasheet
            - generic [ref=e67]: space-marines
            - generic [ref=e68]: blood angels
          - paragraph [ref=e69]: "Baal Predator — Other, 1 model: 125pts."
        - generic [ref=e70]:
          - generic [ref=e71]:
            - generic [ref=e72]:
              - generic [ref=e73]: "#5"
              - heading "Blood Angels Captain" [level=3] [ref=e74]
            - generic [ref=e75]: 100%
          - generic [ref=e76]:
            - generic [ref=e77]: unit
            - generic [ref=e78]: datasheet
            - generic [ref=e79]: space-marines
            - generic [ref=e80]: blood angels
          - paragraph [ref=e81]: "Blood Angels Captain — Characters, 1 model: 80pts."
        - generic [ref=e82]:
          - generic [ref=e83]:
            - generic [ref=e84]:
              - generic [ref=e85]: "#6"
              - heading "Brother Corbulo" [level=3] [ref=e86]
            - generic [ref=e87]: 100%
          - generic [ref=e88]:
            - generic [ref=e89]: unit
            - generic [ref=e90]: datasheet
            - generic [ref=e91]: space-marines
            - generic [ref=e92]: blood angels
          - paragraph [ref=e93]: "Brother Corbulo — Characters, 1 model: 75pts."
        - generic [ref=e94]:
          - generic [ref=e95]:
            - generic [ref=e96]:
              - generic [ref=e97]: "#7"
              - heading "Captain Tycho" [level=3] [ref=e98]
            - generic [ref=e99]: 100%
          - generic [ref=e100]:
            - generic [ref=e101]: unit
            - generic [ref=e102]: datasheet
            - generic [ref=e103]: space-marines
            - generic [ref=e104]: blood angels
          - paragraph [ref=e105]: "Captain Tycho — Characters, 1 model: 75pts."
        - generic [ref=e106]:
          - generic [ref=e107]:
            - generic [ref=e108]:
              - generic [ref=e109]: "#8"
              - heading "Chief Librarian Mephiston" [level=3] [ref=e110]
            - generic [ref=e111]: 100%
          - generic [ref=e112]:
            - generic [ref=e113]: unit
            - generic [ref=e114]: datasheet
            - generic [ref=e115]: space-marines
            - generic [ref=e116]: blood angels
          - paragraph [ref=e117]: "Chief Librarian Mephiston — Characters, 1 model: 120pts."
        - generic [ref=e118]:
          - generic [ref=e119]:
            - generic [ref=e120]:
              - generic [ref=e121]: "#9"
              - heading "Commander Dante" [level=3] [ref=e122]
            - generic [ref=e123]: 100%
          - generic [ref=e124]:
            - generic [ref=e125]: unit
            - generic [ref=e126]: datasheet
            - generic [ref=e127]: space-marines
            - generic [ref=e128]: blood angels
          - paragraph [ref=e129]: "Commander Dante — Characters, 1 model: 120pts."
        - generic [ref=e130]:
          - generic [ref=e131]:
            - generic [ref=e132]:
              - generic [ref=e133]: "#10"
              - heading "Death Company Captain" [level=3] [ref=e134]
            - generic [ref=e135]: 100%
          - generic [ref=e136]:
            - generic [ref=e137]: unit
            - generic [ref=e138]: datasheet
            - generic [ref=e139]: space-marines
            - generic [ref=e140]: blood angels
          - paragraph [ref=e141]: "Death Company Captain — Characters, 1 model: 70pts."
        - generic [ref=e142]:
          - generic [ref=e143]:
            - generic [ref=e144]:
              - generic [ref=e145]: "#11"
              - heading "Death Company Captain with Jump Pack" [level=3] [ref=e146]
            - generic [ref=e147]: 100%
          - generic [ref=e148]:
            - generic [ref=e149]: unit
            - generic [ref=e150]: datasheet
            - generic [ref=e151]: space-marines
            - generic [ref=e152]: blood angels
          - paragraph [ref=e153]: "Death Company Captain with Jump Pack — Characters, 1 model: 75pts."
        - generic [ref=e154]:
          - generic [ref=e155]:
            - generic [ref=e156]:
              - generic [ref=e157]: "#12"
              - heading "Death Company Dreadnought" [level=3] [ref=e158]
            - generic [ref=e159]: 100%
          - generic [ref=e160]:
            - generic [ref=e161]: unit
            - generic [ref=e162]: datasheet
            - generic [ref=e163]: space-marines
            - generic [ref=e164]: blood angels
          - paragraph [ref=e165]: "Death Company Dreadnought — Other, 1 model: 160pts."
        - generic [ref=e166]:
          - generic [ref=e167]:
            - generic [ref=e168]:
              - generic [ref=e169]: "#13"
              - heading "Death Company Dreadnought with Magna-grapple" [level=3] [ref=e170]
            - generic [ref=e171]: 100%
          - generic [ref=e172]:
            - generic [ref=e173]: unit
            - generic [ref=e174]: datasheet
            - generic [ref=e175]: space-marines
            - generic [ref=e176]: blood angels
          - paragraph [ref=e177]: "Death Company Dreadnought with Magna-grapple — Other, 1 model: 145pts."
        - generic [ref=e178]:
          - generic [ref=e179]:
            - generic [ref=e180]:
              - generic [ref=e181]: "#14"
              - heading "Death Company Marines" [level=3] [ref=e182]
            - generic [ref=e183]: 100%
          - generic [ref=e184]:
            - generic [ref=e185]: unit
            - generic [ref=e186]: datasheet
            - generic [ref=e187]: space-marines
            - generic [ref=e188]: blood angels
          - paragraph [ref=e189]: "Death Company Marines — Other, 5 models: 85pts, 10 models: 160pts."
        - generic [ref=e190]:
          - generic [ref=e191]:
            - generic [ref=e192]:
              - generic [ref=e193]: "#15"
              - heading "Death Company Marines with Bolt Rifles" [level=3] [ref=e194]
            - generic [ref=e195]: 100%
          - generic [ref=e196]:
            - generic [ref=e197]: unit
            - generic [ref=e198]: datasheet
            - generic [ref=e199]: space-marines
            - generic [ref=e200]: blood angels
          - paragraph [ref=e201]: "Death Company Marines with Bolt Rifles — Other, 5 models: 85pts, 10 models: 160pts."
        - generic [ref=e202]:
          - generic [ref=e203]:
            - generic [ref=e204]:
              - generic [ref=e205]: "#16"
              - heading "Death Company Marines with Boltguns" [level=3] [ref=e206]
            - generic [ref=e207]: 100%
          - generic [ref=e208]:
            - generic [ref=e209]: unit
            - generic [ref=e210]: datasheet
            - generic [ref=e211]: space-marines
            - generic [ref=e212]: blood angels
          - paragraph [ref=e213]: "Death Company Marines with Boltguns — Other, 5 models: 125pts, 10 models: 250pts."
        - generic [ref=e214]:
          - generic [ref=e215]:
            - generic [ref=e216]:
              - generic [ref=e217]: "#17"
              - heading "Death Company Marines with Boltguns and Jump Packs" [level=3] [ref=e218]
            - generic [ref=e219]: 100%
          - generic [ref=e220]:
            - generic [ref=e221]: unit
            - generic [ref=e222]: datasheet
            - generic [ref=e223]: space-marines
            - generic [ref=e224]: blood angels
          - paragraph [ref=e225]: "Death Company Marines with Boltguns and Jump Packs — Other, 5 models: 140pts, 10 models: 280pts."
        - generic [ref=e226]:
          - generic [ref=e227]:
            - generic [ref=e228]:
              - generic [ref=e229]: "#18"
              - heading "Death Company Marines With Jump Packs" [level=3] [ref=e230]
            - generic [ref=e231]: 100%
          - generic [ref=e232]:
            - generic [ref=e233]: unit
            - generic [ref=e234]: datasheet
            - generic [ref=e235]: space-marines
            - generic [ref=e236]: blood angels
          - paragraph [ref=e237]: "Death Company Marines With Jump Packs — Other, 5 models: 120pts, 10 models: 230pts."
        - generic [ref=e238]:
          - generic [ref=e239]:
            - generic [ref=e240]:
              - generic [ref=e241]: "#19"
              - heading "Furioso Dreadnought" [level=3] [ref=e242]
            - generic [ref=e243]: 100%
          - generic [ref=e244]:
            - generic [ref=e245]: unit
            - generic [ref=e246]: datasheet
            - generic [ref=e247]: space-marines
            - generic [ref=e248]: blood angels
          - paragraph [ref=e249]: "Furioso Dreadnought — Other, 1 model: 150pts."
        - generic [ref=e250]:
          - generic [ref=e251]:
            - generic [ref=e252]:
              - generic [ref=e253]: "#20"
              - heading "Gabriel Seth" [level=3] [ref=e254]
            - generic [ref=e255]: 100%
          - generic [ref=e256]:
            - generic [ref=e257]: unit
            - generic [ref=e258]: datasheet
            - generic [ref=e259]: space-marines
            - generic [ref=e260]: blood angels
          - paragraph [ref=e261]: "Gabriel Seth — Characters, 1 model: 90pts."
        - generic [ref=e262]:
          - generic [ref=e263]:
            - generic [ref=e264]:
              - generic [ref=e265]: "#21"
              - heading "Lemartes" [level=3] [ref=e266]
            - generic [ref=e267]: 100%
          - generic [ref=e268]:
            - generic [ref=e269]: unit
            - generic [ref=e270]: datasheet
            - generic [ref=e271]: space-marines
            - generic [ref=e272]: blood angels
          - paragraph [ref=e273]: "Lemartes — Characters, 1 model: 100pts."
        - generic [ref=e274]:
          - generic [ref=e275]:
            - generic [ref=e276]:
              - generic [ref=e277]: "#22"
              - heading "Librarian Dreadnought" [level=3] [ref=e278]
            - generic [ref=e279]: 100%
          - generic [ref=e280]:
            - generic [ref=e281]: unit
            - generic [ref=e282]: datasheet
            - generic [ref=e283]: space-marines
            - generic [ref=e284]: blood angels
          - paragraph [ref=e285]: "Librarian Dreadnought — Other, 1 model: 170pts."
        - generic [ref=e286]:
          - generic [ref=e287]:
            - generic [ref=e288]:
              - generic [ref=e289]: "#23"
              - heading "Sanguinary Guard" [level=3] [ref=e290]
            - generic [ref=e291]: 100%
          - generic [ref=e292]:
            - generic [ref=e293]: unit
            - generic [ref=e294]: datasheet
            - generic [ref=e295]: space-marines
            - generic [ref=e296]: blood angels
          - paragraph [ref=e297]: "Sanguinary Guard — Other, 3 models: 125pts, 6 models: 260pts."
        - generic [ref=e298]:
          - generic [ref=e299]:
            - generic [ref=e300]:
              - generic [ref=e301]: "#24"
              - heading "Sanguinary Priest" [level=3] [ref=e302]
            - generic [ref=e303]: 100%
          - generic [ref=e304]:
            - generic [ref=e305]: unit
            - generic [ref=e306]: datasheet
            - generic [ref=e307]: space-marines
            - generic [ref=e308]: blood angels
          - paragraph [ref=e309]: "Sanguinary Priest — Characters, 1 model: 75pts."
        - generic [ref=e310]:
          - generic [ref=e311]:
            - generic [ref=e312]:
              - generic [ref=e313]: "#25"
              - heading "Sanguinary Priest on Bike" [level=3] [ref=e314]
            - generic [ref=e315]: 100%
          - generic [ref=e316]:
            - generic [ref=e317]: unit
            - generic [ref=e318]: datasheet
            - generic [ref=e319]: space-marines
            - generic [ref=e320]: blood angels
          - paragraph [ref=e321]: "Sanguinary Priest on Bike — Characters, 1 model: 135pts."
        - generic [ref=e322]:
          - generic [ref=e323]:
            - generic [ref=e324]:
              - generic [ref=e325]: "#26"
              - heading "Sanguinary Priest With Jump Pack" [level=3] [ref=e326]
            - generic [ref=e327]: 100%
          - generic [ref=e328]:
            - generic [ref=e329]: unit
            - generic [ref=e330]: datasheet
            - generic [ref=e331]: space-marines
            - generic [ref=e332]: blood angels
          - paragraph [ref=e333]: "Sanguinary Priest With Jump Pack — Characters, 1 model: 100pts."
        - generic [ref=e334]:
          - generic [ref=e335]:
            - generic [ref=e336]:
              - generic [ref=e337]: "#27"
              - heading "The Sanguinor" [level=3] [ref=e338]
            - generic [ref=e339]: 100%
          - generic [ref=e340]:
            - generic [ref=e341]: unit
            - generic [ref=e342]: datasheet
            - generic [ref=e343]: space-marines
            - generic [ref=e344]: blood angels
          - paragraph [ref=e345]: "The Sanguinor — Characters, 1 model: 130pts."
        - generic [ref=e346]:
          - generic [ref=e347]:
            - generic [ref=e348]:
              - generic [ref=e349]: "#28"
              - heading "Tycho The Lost" [level=3] [ref=e350]
            - generic [ref=e351]: 100%
          - generic [ref=e352]:
            - generic [ref=e353]: unit
            - generic [ref=e354]: datasheet
            - generic [ref=e355]: space-marines
            - generic [ref=e356]: blood angels
          - paragraph [ref=e357]: "Tycho The Lost — Characters, 1 model: 90pts."
        - generic [ref=e358]:
          - generic [ref=e359]:
            - generic [ref=e360]:
              - generic [ref=e361]: "#29"
              - heading "An Honourable Death in Combat" [level=3] [ref=e362]
            - generic [ref=e363]: 100%
          - generic [ref=e364]:
            - generic [ref=e365]: unit
            - generic [ref=e366]: unit-ability
            - generic [ref=e367]: space-marines
            - generic [ref=e368]: blood angels
          - paragraph [ref=e369]: An Honourable Death in Combat (Datasheet) on Death Company Marines — Each time a model in this unit makes an attack, that attack has the [SUSTAINED HITS 1] ability if this unit is below ...
        - generic [ref=e370]:
          - generic [ref=e371]:
            - generic [ref=e372]:
              - generic [ref=e373]: "#30"
              - heading "An Honourable Death in Combat" [level=3] [ref=e374]
            - generic [ref=e375]: 100%
          - generic [ref=e376]:
            - generic [ref=e377]: unit
            - generic [ref=e378]: unit-ability
            - generic [ref=e379]: space-marines
            - generic [ref=e380]: blood angels
          - paragraph [ref=e381]: An Honourable Death in Combat (Datasheet) on Death Company Marines with Boltguns — Each time a model in this unit makes an attack, that attack has the [SUSTAINED HITS 1] ability if this unit is below ...
        - generic [ref=e382]:
          - generic [ref=e383]:
            - generic [ref=e384]:
              - generic [ref=e385]: "#31"
              - heading "Angelic Visage" [level=3] [ref=e386]
            - generic [ref=e387]: 100%
          - generic [ref=e388]:
            - generic [ref=e389]: unit
            - generic [ref=e390]: unit-ability
            - generic [ref=e391]: space-marines
            - generic [ref=e392]: blood angels
          - paragraph [ref=e393]: Angelic Visage (Datasheet) on Sanguinary Guard — Each time a melee attack targets this unit, subtract 1 from the Hit roll.
        - generic [ref=e394]:
          - generic [ref=e395]:
            - generic [ref=e396]:
              - generic [ref=e397]: "#32"
              - heading "ATTACHED UNIT" [level=3] [ref=e398]
            - generic [ref=e399]: 100%
          - generic [ref=e400]:
            - generic [ref=e401]: unit
            - generic [ref=e402]: unit-ability
            - generic [ref=e403]: space-marines
            - generic [ref=e404]: blood angels
          - paragraph [ref=e405]: ATTACHED UNIT (Special (правая колонка)) on Sanguinary Guard — If a Captain model from your army with the Leader ability can be attached to an Assault Intercessors with Jump Packs ...
        - generic [ref=e406]:
          - generic [ref=e407]:
            - generic [ref=e408]:
              - generic [ref=e409]: "#33"
              - heading "ATTACHED UNIT" [level=3] [ref=e410]
            - generic [ref=e411]: 100%
          - generic [ref=e412]:
            - generic [ref=e413]: unit
            - generic [ref=e414]: unit-ability
            - generic [ref=e415]: space-marines
            - generic [ref=e416]: blood angels
          - paragraph [ref=e417]: ATTACHED UNIT (Special (правая колонка)) on Death Company Marines — If a Chaplain model from your army with the Leader ability can be attached to an Assault Intercessor Squad unit, it c...
        - generic [ref=e418]:
          - generic [ref=e419]:
            - generic [ref=e420]:
              - generic [ref=e421]: "#34"
              - heading "ATTACHED UNIT" [level=3] [ref=e422]
            - generic [ref=e423]: 100%
          - generic [ref=e424]:
            - generic [ref=e425]: unit
            - generic [ref=e426]: unit-ability
            - generic [ref=e427]: space-marines
            - generic [ref=e428]: blood angels
          - paragraph [ref=e429]: ATTACHED UNIT (Special (правая колонка)) on Death Company Marines with Bolt Rifles — If a Chaplain model from your army with the Leader ability can be attached to an Intercessor Squad unit, it can be at...
        - generic [ref=e430]:
          - generic [ref=e431]:
            - generic [ref=e432]:
              - generic [ref=e433]: "#35"
              - heading "ATTACHED UNIT" [level=3] [ref=e434]
            - generic [ref=e435]: 100%
          - generic [ref=e436]:
            - generic [ref=e437]: unit
            - generic [ref=e438]: unit-ability
            - generic [ref=e439]: space-marines
            - generic [ref=e440]: blood angels
          - paragraph [ref=e441]: ATTACHED UNIT (Special (правая колонка)) on Death Company Marines With Jump Packs — If a Chaplain model from your army with the Leader ability can be attached to Assault Intercessors with Jump Packs, i...
        - generic [ref=e442]:
          - generic [ref=e443]:
            - generic [ref=e444]:
              - generic [ref=e445]: "#36"
              - heading "Aura of Fervour (Aura)" [level=3] [ref=e446]
            - generic [ref=e447]: 100%
          - generic [ref=e448]:
            - generic [ref=e449]: unit
            - generic [ref=e450]: unit-ability
            - generic [ref=e451]: space-marines
            - generic [ref=e452]: blood angels
          - paragraph [ref=e453]: Aura of Fervour (Aura) (Datasheet) on The Sanguinor — While a friendly ADEPTUS ASTARTES unit is within 6" of this model, you can re-roll Battle-shock and Leadership tests ...
        - generic [ref=e454]:
          - generic [ref=e455]:
            - generic [ref=e456]:
              - generic [ref=e457]: "#37"
              - heading "Berserk Fury" [level=3] [ref=e458]
            - generic [ref=e459]: 100%
          - generic [ref=e460]:
            - generic [ref=e461]: unit
            - generic [ref=e462]: unit-ability
            - generic [ref=e463]: space-marines
            - generic [ref=e464]: blood angels
          - paragraph [ref=e465]: Berserk Fury (Datasheet) on Death Company Marines with Boltguns and Jump Packs — You can re-roll Charge rolls made for this unit.
        - generic [ref=e466]:
          - generic [ref=e467]:
            - generic [ref=e468]:
              - generic [ref=e469]: "#38"
              - heading "Black Rage" [level=3] [ref=e470]
            - generic [ref=e471]: 100%
          - generic [ref=e472]:
            - generic [ref=e473]: unit
            - generic [ref=e474]: unit-ability
            - generic [ref=e475]: space-marines
            - generic [ref=e476]: blood angels
          - paragraph [ref=e477]: Black Rage (Datasheet) on Tycho The Lost — Each time this model makes a melee attack, you can re-roll the Hit roll. While this model’s unit is not within 6" of ...
        - generic [ref=e478]:
          - generic [ref=e479]:
            - generic [ref=e480]:
              - generic [ref=e481]: "#39"
              - heading "Black Rage" [level=3] [ref=e482]
            - generic [ref=e483]: 100%
          - generic [ref=e484]:
            - generic [ref=e485]: unit
            - generic [ref=e486]: unit-ability
            - generic [ref=e487]: space-marines
            - generic [ref=e488]: blood angels
          - paragraph [ref=e489]: Black Rage (Datasheet) on Death Company Dreadnought — Each time this model makes a melee attack, you can re-roll the Hit roll. While this model’s unit is not within 6" of ...
        - generic [ref=e490]:
          - generic [ref=e491]:
            - generic [ref=e492]:
              - generic [ref=e493]: "#40"
              - heading "Black Rage" [level=3] [ref=e494]
            - generic [ref=e495]: 100%
          - generic [ref=e496]:
            - generic [ref=e497]: unit
            - generic [ref=e498]: unit-ability
            - generic [ref=e499]: space-marines
            - generic [ref=e500]: blood angels
          - paragraph [ref=e501]: Black Rage (Datasheet) on Death Company Marines — Each time this model makes a melee attack, you can re-roll the Hit roll. While this model’s unit is not within 6" of ...
        - generic [ref=e502]:
          - generic [ref=e503]:
            - generic [ref=e504]:
              - generic [ref=e505]: "#41"
              - heading "Black Rage" [level=3] [ref=e506]
            - generic [ref=e507]: 100%
          - generic [ref=e508]:
            - generic [ref=e509]: unit
            - generic [ref=e510]: unit-ability
            - generic [ref=e511]: space-marines
            - generic [ref=e512]: blood angels
          - paragraph [ref=e513]: Black Rage (Datasheet) on Death Company Marines with Bolt Rifles — Each time this model makes a melee attack, you can re-roll the Hit roll. While this model’s unit is not within 6" of ...
        - generic [ref=e514]:
          - generic [ref=e515]:
            - generic [ref=e516]:
              - generic [ref=e517]: "#42"
              - heading "Black Rage" [level=3] [ref=e518]
            - generic [ref=e519]: 100%
          - generic [ref=e520]:
            - generic [ref=e521]: unit
            - generic [ref=e522]: unit-ability
            - generic [ref=e523]: space-marines
            - generic [ref=e524]: blood angels
          - paragraph [ref=e525]: Black Rage (Datasheet) on Death Company Marines With Jump Packs — Each time this model makes a melee attack, you can re-roll the Hit roll. While this model’s unit is not within 6" of ...
        - generic [ref=e526]:
          - generic [ref=e527]:
            - generic [ref=e528]:
              - generic [ref=e529]: "#43"
              - heading "Black Rage" [level=3] [ref=e530]
            - generic [ref=e531]: 100%
          - generic [ref=e532]:
            - generic [ref=e533]: unit
            - generic [ref=e534]: unit-ability
            - generic [ref=e535]: space-marines
            - generic [ref=e536]: blood angels
          - paragraph [ref=e537]: Black Rage (Datasheet) on Death Company Captain — Each time this model makes a melee attack, you can re-roll the Hit roll. While this model’s unit is not within 6" of ...
        - generic [ref=e538]:
          - generic [ref=e539]:
            - generic [ref=e540]:
              - generic [ref=e541]: "#44"
              - heading "Black Rage" [level=3] [ref=e542]
            - generic [ref=e543]: 100%
          - generic [ref=e544]:
            - generic [ref=e545]: unit
            - generic [ref=e546]: unit-ability
            - generic [ref=e547]: space-marines
            - generic [ref=e548]: blood angels
          - paragraph [ref=e549]: Black Rage (Datasheet) on Death Company Captain with Jump Pack — Each time this model makes a melee attack, you can re-roll the Hit roll. While this model’s unit is not within 6" of ...
        - generic [ref=e550]:
          - generic [ref=e551]:
            - generic [ref=e552]:
              - generic [ref=e553]: "#45"
              - heading "Black Rage" [level=3] [ref=e554]
            - generic [ref=e555]: 100%
          - generic [ref=e556]:
            - generic [ref=e557]: unit
            - generic [ref=e558]: unit-ability
            - generic [ref=e559]: space-marines
            - generic [ref=e560]: blood angels
          - paragraph [ref=e561]: Black Rage (Datasheet) on Death Company Dreadnought with Magna-grapple — Each time this model makes a melee attack, you can re-roll the Hit roll. While this model’s unit is not within 6" of ...
        - generic [ref=e562]:
          - generic [ref=e563]:
            - generic [ref=e564]:
              - generic [ref=e565]: "#46"
              - heading "Black Rage" [level=3] [ref=e566]
            - generic [ref=e567]: 100%
          - generic [ref=e568]:
            - generic [ref=e569]: unit
            - generic [ref=e570]: unit-ability
            - generic [ref=e571]: space-marines
            - generic [ref=e572]: blood angels
          - paragraph [ref=e573]: Black Rage (Datasheet) on Death Company Marines with Boltguns — Each time this model makes a melee attack, you can re-roll the Hit roll. While this model’s unit is not within 6" of ...
        - generic [ref=e574]:
          - generic [ref=e575]:
            - generic [ref=e576]:
              - generic [ref=e577]: "#47"
              - heading "Black Rage" [level=3] [ref=e578]
            - generic [ref=e579]: 100%
          - generic [ref=e580]:
            - generic [ref=e581]: unit
            - generic [ref=e582]: unit-ability
            - generic [ref=e583]: space-marines
            - generic [ref=e584]: blood angels
          - paragraph [ref=e585]: Black Rage (Datasheet) on Death Company Marines with Boltguns and Jump Packs — Each time this model makes a melee attack, you can re-roll the Hit roll. While this model’s unit is not within 6" of ...
        - generic [ref=e586]:
          - generic [ref=e587]:
            - generic [ref=e588]:
              - generic [ref=e589]: "#48"
              - heading "Blood Chalice" [level=3] [ref=e590]
            - generic [ref=e591]: 100%
          - generic [ref=e592]:
            - generic [ref=e593]: unit
            - generic [ref=e594]: unit-ability
            - generic [ref=e595]: space-marines
            - generic [ref=e596]: blood angels
          - paragraph [ref=e597]: Blood Chalice (Datasheet) on Sanguinary Priest — While this model is leading a unit, improve the Armour Penetration characteristic of melee weapons equipped by models...
        - generic [ref=e598]:
          - generic [ref=e599]:
            - generic [ref=e600]:
              - generic [ref=e601]: "#49"
              - heading "Blood Chalice" [level=3] [ref=e602]
            - generic [ref=e603]: 100%
          - generic [ref=e604]:
            - generic [ref=e605]: unit
            - generic [ref=e606]: unit-ability
            - generic [ref=e607]: space-marines
            - generic [ref=e608]: blood angels
          - paragraph [ref=e609]: Blood Chalice (Datasheet) on Sanguinary Priest on Bike — While this model is leading a unit, improve the Armour Penetration characteristic of melee weapons equipped by models...
        - generic [ref=e610]:
          - generic [ref=e611]:
            - generic [ref=e612]:
              - generic [ref=e613]: "#50"
              - heading "Blood Chalice" [level=3] [ref=e614]
            - generic [ref=e615]: 100%
          - generic [ref=e616]:
            - generic [ref=e617]: unit
            - generic [ref=e618]: unit-ability
            - generic [ref=e619]: space-marines
            - generic [ref=e620]: blood angels
          - paragraph [ref=e621]: Blood Chalice (Datasheet) on Sanguinary Priest With Jump Pack — While this model is leading a unit, improve the Armour Penetration characteristic of melee weapons equipped by models...
        - generic [ref=e622]:
          - generic [ref=e623]:
            - generic [ref=e624]:
              - generic [ref=e625]: "#51"
              - heading "Deadly Demise" [level=3] [ref=e626]
            - generic [ref=e627]: 100%
          - generic [ref=e628]:
            - generic [ref=e629]: unit
            - generic [ref=e630]: unit-ability
            - generic [ref=e631]: space-marines
            - generic [ref=e632]: blood angels
          - paragraph [ref=e633]: Deadly Demise (Core) on Librarian Dreadnought — DEADLY DEMISE From detonating ammo stores to corrosive innards or frenzied death throes, some targets are deadly even...
        - generic [ref=e634]:
          - generic [ref=e635]:
            - generic [ref=e636]:
              - generic [ref=e637]: "#52"
              - heading "Deadly Demise" [level=3] [ref=e638]
            - generic [ref=e639]: 100%
          - generic [ref=e640]:
            - generic [ref=e641]: unit
            - generic [ref=e642]: unit-ability
            - generic [ref=e643]: space-marines
            - generic [ref=e644]: blood angels
          - paragraph [ref=e645]: Deadly Demise (Core) on Death Company Dreadnought — DEADLY DEMISE From detonating ammo stores to corrosive innards or frenzied death throes, some targets are deadly even...
        - generic [ref=e646]:
          - generic [ref=e647]:
            - generic [ref=e648]:
              - generic [ref=e649]: "#53"
              - heading "Deadly Demise" [level=3] [ref=e650]
            - generic [ref=e651]: 100%
          - generic [ref=e652]:
            - generic [ref=e653]: unit
            - generic [ref=e654]: unit-ability
            - generic [ref=e655]: space-marines
            - generic [ref=e656]: blood angels
          - paragraph [ref=e657]: Deadly Demise (Core) on Furioso Dreadnought — DEADLY DEMISE From detonating ammo stores to corrosive innards or frenzied death throes, some targets are deadly even...
        - generic [ref=e658]:
          - generic [ref=e659]:
            - generic [ref=e660]:
              - generic [ref=e661]: "#54"
              - heading "Deadly Demise" [level=3] [ref=e662]
            - generic [ref=e663]: 100%
          - generic [ref=e664]:
            - generic [ref=e665]: unit
            - generic [ref=e666]: unit-ability
            - generic [ref=e667]: space-marines
            - generic [ref=e668]: blood angels
          - paragraph [ref=e669]: Deadly Demise (Core) on Baal Predator — DEADLY DEMISE From detonating ammo stores to corrosive innards or frenzied death throes, some targets are deadly even...
        - generic [ref=e670]:
          - generic [ref=e671]:
            - generic [ref=e672]:
              - generic [ref=e673]: "#55"
              - heading "Deadly Demise" [level=3] [ref=e674]
            - generic [ref=e675]: 100%
          - generic [ref=e676]:
            - generic [ref=e677]: unit
            - generic [ref=e678]: unit-ability
            - generic [ref=e679]: space-marines
            - generic [ref=e680]: blood angels
          - paragraph [ref=e681]: Deadly Demise (Core) on Death Company Dreadnought with Magna-grapple — DEADLY DEMISE From detonating ammo stores to corrosive innards or frenzied death throes, some targets are deadly even...
        - generic [ref=e682]:
          - generic [ref=e683]:
            - generic [ref=e684]:
              - generic [ref=e685]: "#56"
              - heading "DEATH COMPANY" [level=3] [ref=e686]
            - generic [ref=e687]: 100%
          - generic [ref=e688]:
            - generic [ref=e689]: unit
            - generic [ref=e690]: unit-ability
            - generic [ref=e691]: space-marines
            - generic [ref=e692]: blood angels
          - paragraph [ref=e693]: DEATH COMPANY (Special (правая колонка)) on Death Company Marines with Boltguns — If a Chaplain model from your army with the Leader ability can be attached to a Tactical Squad, it can be attached to...
        - generic [ref=e694]:
          - generic [ref=e695]:
            - generic [ref=e696]:
              - generic [ref=e697]: "#57"
              - heading "DEATH COMPANY" [level=3] [ref=e698]
            - generic [ref=e699]: 100%
          - generic [ref=e700]:
            - generic [ref=e701]: unit
            - generic [ref=e702]: unit-ability
            - generic [ref=e703]: space-marines
            - generic [ref=e704]: blood angels
          - paragraph [ref=e705]: DEATH COMPANY (Special (правая колонка)) on Death Company Marines with Boltguns and Jump Packs — If a Chaplain model from your army with the Leader ability can be attached to Assault Intercessors with Jump Packs or...
        - generic [ref=e706]:
          - generic [ref=e707]:
            - generic [ref=e708]:
              - generic [ref=e709]: "#58"
              - heading "Death Mask of Sanguinius" [level=3] [ref=e710]
            - generic [ref=e711]: 100%
          - generic [ref=e712]:
            - generic [ref=e713]: unit
            - generic [ref=e714]: unit-ability
            - generic [ref=e715]: space-marines
            - generic [ref=e716]: blood angels
          - paragraph [ref=e717]: Death Mask of Sanguinius (Datasheet) on Commander Dante — At the start of the Fight phase, each enemy unit within 6" of this model must take a Battle-shock test, subtracting 1...
        - generic [ref=e718]:
          - generic [ref=e719]:
            - generic [ref=e720]:
              - generic [ref=e721]: "#59"
              - heading "Death Vision of Sanguinius" [level=3] [ref=e722]
            - generic [ref=e723]: 100%
          - generic [ref=e724]:
            - generic [ref=e725]: unit
            - generic [ref=e726]: unit-ability
            - generic [ref=e727]: space-marines
            - generic [ref=e728]: blood angels
          - paragraph [ref=e729]: Death Vision of Sanguinius (Datasheet) on Tycho The Lost — If this model is destroyed by a melee attack, after the attacking unit has finished making its attacks, you can roll ...
        - generic [ref=e730]:
          - generic [ref=e731]:
            - generic [ref=e732]:
              - generic [ref=e733]: "#60"
              - heading "Death Vision of Sanguinius" [level=3] [ref=e734]
            - generic [ref=e735]: 100%
          - generic [ref=e736]:
            - generic [ref=e737]: unit
            - generic [ref=e738]: unit-ability
            - generic [ref=e739]: space-marines
            - generic [ref=e740]: blood angels
          - paragraph [ref=e741]: Death Vision of Sanguinius (Datasheet) on Death Company Captain — If this model is destroyed by a melee attack, after the attacking unit has finished making its attacks, you can roll ...
        - generic [ref=e742]:
          - generic [ref=e743]:
            - generic [ref=e744]:
              - generic [ref=e745]: "#61"
              - heading "Death Vision of Sanguinius" [level=3] [ref=e746]
            - generic [ref=e747]: 100%
          - generic [ref=e748]:
            - generic [ref=e749]: unit
            - generic [ref=e750]: unit-ability
            - generic [ref=e751]: space-marines
            - generic [ref=e752]: blood angels
          - paragraph [ref=e753]: Death Vision of Sanguinius (Datasheet) on Death Company Captain with Jump Pack — If this model is destroyed by a melee attack, after the attacking unit has finished making its attacks, you can roll ...
        - generic [ref=e754]:
          - generic [ref=e755]:
            - generic [ref=e756]:
              - generic [ref=e757]: "#62"
              - heading "Deep Strike" [level=3] [ref=e758]
            - generic [ref=e759]: 100%
          - generic [ref=e760]:
            - generic [ref=e761]: unit
            - generic [ref=e762]: unit-ability
            - generic [ref=e763]: space-marines
            - generic [ref=e764]: blood angels
          - paragraph [ref=e765]: Deep Strike (Core) on Commander Dante — DEEP STRIKE Some units make their way to battle via tunnelling, teleportation, high-altitude descent or other extraor...
        - generic [ref=e766]:
          - generic [ref=e767]:
            - generic [ref=e768]:
              - generic [ref=e769]: "#63"
              - heading "Deep Strike" [level=3] [ref=e770]
            - generic [ref=e771]: 100%
          - generic [ref=e772]:
            - generic [ref=e773]: unit
            - generic [ref=e774]: unit-ability
            - generic [ref=e775]: space-marines
            - generic [ref=e776]: blood angels
          - paragraph [ref=e777]: Deep Strike (Core) on The Sanguinor — DEEP STRIKE Some units make their way to battle via tunnelling, teleportation, high-altitude descent or other extraor...
        - generic [ref=e778]:
          - generic [ref=e779]:
            - generic [ref=e780]:
              - generic [ref=e781]: "#64"
              - heading "Deep Strike" [level=3] [ref=e782]
            - generic [ref=e783]: 100%
          - generic [ref=e784]:
            - generic [ref=e785]: unit
            - generic [ref=e786]: unit-ability
            - generic [ref=e787]: space-marines
            - generic [ref=e788]: blood angels
          - paragraph [ref=e789]: Deep Strike (Core) on Astorath — DEEP STRIKE Some units make their way to battle via tunnelling, teleportation, high-altitude descent or other extraor...
        - generic [ref=e790]:
          - generic [ref=e791]:
            - generic [ref=e792]:
              - generic [ref=e793]: "#65"
              - heading "Deep Strike" [level=3] [ref=e794]
            - generic [ref=e795]: 100%
          - generic [ref=e796]:
            - generic [ref=e797]: unit
            - generic [ref=e798]: unit-ability
            - generic [ref=e799]: space-marines
            - generic [ref=e800]: blood angels
          - paragraph [ref=e801]: Deep Strike (Core) on Lemartes — DEEP STRIKE Some units make their way to battle via tunnelling, teleportation, high-altitude descent or other extraor...
        - generic [ref=e802]:
          - generic [ref=e803]:
            - generic [ref=e804]:
              - generic [ref=e805]: "#66"
              - heading "Deep Strike" [level=3] [ref=e806]
            - generic [ref=e807]: 100%
          - generic [ref=e808]:
            - generic [ref=e809]: unit
            - generic [ref=e810]: unit-ability
            - generic [ref=e811]: space-marines
            - generic [ref=e812]: blood angels
          - paragraph [ref=e813]: Deep Strike (Core) on Sanguinary Guard — DEEP STRIKE Some units make their way to battle via tunnelling, teleportation, high-altitude descent or other extraor...
        - generic [ref=e814]:
          - generic [ref=e815]:
            - generic [ref=e816]:
              - generic [ref=e817]: "#67"
              - heading "Deep Strike" [level=3] [ref=e818]
            - generic [ref=e819]: 100%
          - generic [ref=e820]:
            - generic [ref=e821]: unit
            - generic [ref=e822]: unit-ability
            - generic [ref=e823]: space-marines
            - generic [ref=e824]: blood angels
          - paragraph [ref=e825]: Deep Strike (Core) on Death Company Marines With Jump Packs — DEEP STRIKE Some units make their way to battle via tunnelling, teleportation, high-altitude descent or other extraor...
        - generic [ref=e826]:
          - generic [ref=e827]:
            - generic [ref=e828]:
              - generic [ref=e829]: "#68"
              - heading "Deep Strike" [level=3] [ref=e830]
            - generic [ref=e831]: 100%
          - generic [ref=e832]:
            - generic [ref=e833]: unit
            - generic [ref=e834]: unit-ability
            - generic [ref=e835]: space-marines
            - generic [ref=e836]: blood angels
          - paragraph [ref=e837]: Deep Strike (Core) on Sanguinary Priest With Jump Pack — DEEP STRIKE Some units make their way to battle via tunnelling, teleportation, high-altitude descent or other extraor...
        - generic [ref=e838]:
          - generic [ref=e839]:
            - generic [ref=e840]:
              - generic [ref=e841]: "#69"
              - heading "Deep Strike" [level=3] [ref=e842]
            - generic [ref=e843]: 100%
          - generic [ref=e844]:
            - generic [ref=e845]: unit
            - generic [ref=e846]: unit-ability
            - generic [ref=e847]: space-marines
            - generic [ref=e848]: blood angels
          - paragraph [ref=e849]: Deep Strike (Core) on Death Company Captain with Jump Pack — DEEP STRIKE Some units make their way to battle via tunnelling, teleportation, high-altitude descent or other extraor...
        - generic [ref=e850]:
          - generic [ref=e851]:
            - generic [ref=e852]:
              - generic [ref=e853]: "#70"
              - heading "Deep Strike" [level=3] [ref=e854]
            - generic [ref=e855]: 100%
          - generic [ref=e856]:
            - generic [ref=e857]: unit
            - generic [ref=e858]: unit-ability
            - generic [ref=e859]: space-marines
            - generic [ref=e860]: blood angels
          - paragraph [ref=e861]: Deep Strike (Core) on Death Company Marines with Boltguns and Jump Packs — DEEP STRIKE Some units make their way to battle via tunnelling, teleportation, high-altitude descent or other extraor...
        - generic [ref=e862]:
          - generic [ref=e863]:
            - generic [ref=e864]:
              - generic [ref=e865]: "#71"
              - heading "Driven by Fury" [level=3] [ref=e866]
            - generic [ref=e867]: 100%
          - generic [ref=e868]:
            - generic [ref=e869]: unit
            - generic [ref=e870]: unit-ability
            - generic [ref=e871]: space-marines
            - generic [ref=e872]: blood angels
          - paragraph [ref=e873]: Driven by Fury (Datasheet) on Death Company Dreadnought — In your opponent’s Shooting phase, each time an enemy unit has shot, if this model was hit by one or more of those at...
        - generic [ref=e874]:
          - generic [ref=e875]:
            - generic [ref=e876]:
              - generic [ref=e877]: "#72"
              - heading "Embittered" [level=3] [ref=e878]
            - generic [ref=e879]: 100%
          - generic [ref=e880]:
            - generic [ref=e881]: unit
            - generic [ref=e882]: unit-ability
            - generic [ref=e883]: space-marines
            - generic [ref=e884]: blood angels
          - paragraph [ref=e885]: Embittered (Datasheet) on Captain Tycho — The first time an attack is allocated to this model, after the attacking unit has finished making its attacks, until ...
        - generic [ref=e886]:
          - generic [ref=e887]:
            - generic [ref=e888]:
              - generic [ref=e889]: "#73"
              - heading "Feel No Pain" [level=3] [ref=e890]
            - generic [ref=e891]: 100%
          - generic [ref=e892]:
            - generic [ref=e893]: unit
            - generic [ref=e894]: unit-ability
            - generic [ref=e895]: space-marines
            - generic [ref=e896]: blood angels
          - paragraph [ref=e897]: Feel No Pain (Core) on Tycho The Lost — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e898]:
          - generic [ref=e899]:
            - generic [ref=e900]:
              - generic [ref=e901]: "#74"
              - heading "Feel No Pain" [level=3] [ref=e902]
            - generic [ref=e903]: 100%
          - generic [ref=e904]:
            - generic [ref=e905]: unit
            - generic [ref=e906]: unit-ability
            - generic [ref=e907]: space-marines
            - generic [ref=e908]: blood angels
          - paragraph [ref=e909]: Feel No Pain (Core) on Chief Librarian Mephiston — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e910]:
          - generic [ref=e911]:
            - generic [ref=e912]:
              - generic [ref=e913]: "#75"
              - heading "Feel No Pain" [level=3] [ref=e914]
            - generic [ref=e915]: 100%
          - generic [ref=e916]:
            - generic [ref=e917]: unit
            - generic [ref=e918]: unit-ability
            - generic [ref=e919]: space-marines
            - generic [ref=e920]: blood angels
          - paragraph [ref=e921]: Feel No Pain (Core) on Lemartes — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e922]:
          - generic [ref=e923]:
            - generic [ref=e924]:
              - generic [ref=e925]: "#76"
              - heading "Feel No Pain" [level=3] [ref=e926]
            - generic [ref=e927]: 100%
          - generic [ref=e928]:
            - generic [ref=e929]: unit
            - generic [ref=e930]: unit-ability
            - generic [ref=e931]: space-marines
            - generic [ref=e932]: blood angels
          - paragraph [ref=e933]: Feel No Pain (Core) on Death Company Dreadnought — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e934]:
          - generic [ref=e935]:
            - generic [ref=e936]:
              - generic [ref=e937]: "#77"
              - heading "Feel No Pain" [level=3] [ref=e938]
            - generic [ref=e939]: 100%
          - generic [ref=e940]:
            - generic [ref=e941]: unit
            - generic [ref=e942]: unit-ability
            - generic [ref=e943]: space-marines
            - generic [ref=e944]: blood angels
          - paragraph [ref=e945]: Feel No Pain (Core) on Death Company Marines — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e946]:
          - generic [ref=e947]:
            - generic [ref=e948]:
              - generic [ref=e949]: "#78"
              - heading "Feel No Pain" [level=3] [ref=e950]
            - generic [ref=e951]: 100%
          - generic [ref=e952]:
            - generic [ref=e953]: unit
            - generic [ref=e954]: unit-ability
            - generic [ref=e955]: space-marines
            - generic [ref=e956]: blood angels
          - paragraph [ref=e957]: Feel No Pain (Core) on Death Company Marines with Bolt Rifles — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e958]:
          - generic [ref=e959]:
            - generic [ref=e960]:
              - generic [ref=e961]: "#79"
              - heading "Feel No Pain" [level=3] [ref=e962]
            - generic [ref=e963]: 100%
          - generic [ref=e964]:
            - generic [ref=e965]: unit
            - generic [ref=e966]: unit-ability
            - generic [ref=e967]: space-marines
            - generic [ref=e968]: blood angels
          - paragraph [ref=e969]: Feel No Pain (Core) on Death Company Marines With Jump Packs — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e970]:
          - generic [ref=e971]:
            - generic [ref=e972]:
              - generic [ref=e973]: "#80"
              - heading "Feel No Pain" [level=3] [ref=e974]
            - generic [ref=e975]: 100%
          - generic [ref=e976]:
            - generic [ref=e977]: unit
            - generic [ref=e978]: unit-ability
            - generic [ref=e979]: space-marines
            - generic [ref=e980]: blood angels
          - paragraph [ref=e981]: Feel No Pain (Core) on Death Company Captain — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e982]:
          - generic [ref=e983]:
            - generic [ref=e984]:
              - generic [ref=e985]: "#81"
              - heading "Feel No Pain" [level=3] [ref=e986]
            - generic [ref=e987]: 100%
          - generic [ref=e988]:
            - generic [ref=e989]: unit
            - generic [ref=e990]: unit-ability
            - generic [ref=e991]: space-marines
            - generic [ref=e992]: blood angels
          - paragraph [ref=e993]: Feel No Pain (Core) on Death Company Captain with Jump Pack — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e994]:
          - generic [ref=e995]:
            - generic [ref=e996]:
              - generic [ref=e997]: "#82"
              - heading "Feel No Pain" [level=3] [ref=e998]
            - generic [ref=e999]: 100%
          - generic [ref=e1000]:
            - generic [ref=e1001]: unit
            - generic [ref=e1002]: unit-ability
            - generic [ref=e1003]: space-marines
            - generic [ref=e1004]: blood angels
          - paragraph [ref=e1005]: Feel No Pain (Core) on Death Company Dreadnought with Magna-grapple — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e1006]:
          - generic [ref=e1007]:
            - generic [ref=e1008]:
              - generic [ref=e1009]: "#83"
              - heading "Feel No Pain" [level=3] [ref=e1010]
            - generic [ref=e1011]: 100%
          - generic [ref=e1012]:
            - generic [ref=e1013]: unit
            - generic [ref=e1014]: unit-ability
            - generic [ref=e1015]: space-marines
            - generic [ref=e1016]: blood angels
          - paragraph [ref=e1017]: Feel No Pain (Core) on Death Company Marines with Boltguns — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e1018]:
          - generic [ref=e1019]:
            - generic [ref=e1020]:
              - generic [ref=e1021]: "#84"
              - heading "Feel No Pain" [level=3] [ref=e1022]
            - generic [ref=e1023]: 100%
          - generic [ref=e1024]:
            - generic [ref=e1025]: unit
            - generic [ref=e1026]: unit-ability
            - generic [ref=e1027]: space-marines
            - generic [ref=e1028]: blood angels
          - paragraph [ref=e1029]: Feel No Pain (Core) on Death Company Marines with Boltguns and Jump Packs — FEEL NO PAIN Some warriors refuse to be laid low, even by what should be fatal wounds. Some models have ‘Feel No Pain...
        - generic [ref=e1030]:
          - generic [ref=e1031]:
            - generic [ref=e1032]:
              - generic [ref=e1033]: "#85"
              - heading "Fights First" [level=3] [ref=e1034]
            - generic [ref=e1035]: 100%
          - generic [ref=e1036]:
            - generic [ref=e1037]: unit
            - generic [ref=e1038]: unit-ability
            - generic [ref=e1039]: space-marines
            - generic [ref=e1040]: blood angels
          - paragraph [ref=e1041]: Fights First (Core) on Chief Librarian Mephiston — FIGHTS FIRST Some warriors attack with blinding speed, landing their blows before their foes can react. Units with th...
        - generic [ref=e1042]:
          - generic [ref=e1043]:
            - generic [ref=e1044]:
              - generic [ref=e1045]: "#86"
              - heading "Fights First" [level=3] [ref=e1046]
            - generic [ref=e1047]: 100%
          - generic [ref=e1048]:
            - generic [ref=e1049]: unit
            - generic [ref=e1050]: unit-ability
            - generic [ref=e1051]: space-marines
            - generic [ref=e1052]: blood angels
          - paragraph [ref=e1053]: Fights First (Core) on The Sanguinor — FIGHTS FIRST Some warriors attack with blinding speed, landing their blows before their foes can react. Units with th...
        - generic [ref=e1054]:
          - generic [ref=e1055]:
            - generic [ref=e1056]:
              - generic [ref=e1057]: "#87"
              - heading "Finest Hour" [level=3] [ref=e1058]
            - generic [ref=e1059]: 100%
          - generic [ref=e1060]:
            - generic [ref=e1061]: unit
            - generic [ref=e1062]: unit-ability
            - generic [ref=e1063]: space-marines
            - generic [ref=e1064]: blood angels
          - paragraph [ref=e1065]: Finest Hour (Datasheet) on Blood Angels Captain — Once per battle, at the start of the Fight phase, this model can use this ability. If it does, until the end of the p...
        - generic [ref=e1066]:
          - generic [ref=e1067]:
            - generic [ref=e1068]:
              - generic [ref=e1069]: "#88"
              - heading "FLESH TEARERS" [level=3] [ref=e1070]
            - generic [ref=e1071]: 100%
          - generic [ref=e1072]:
            - generic [ref=e1073]: unit
            - generic [ref=e1074]: unit-ability
            - generic [ref=e1075]: space-marines
            - generic [ref=e1076]: blood angels
          - paragraph [ref=e1077]: FLESH TEARERS (Fortification (левая колонка)) on Gabriel Seth — This model is from the Flesh Tearers Chapter, a successor of the Blood Angels. For all rules purposes, it is treated ...
        - generic [ref=e1078]:
          - generic [ref=e1079]:
            - generic [ref=e1080]:
              - generic [ref=e1081]: "#89"
              - heading "Forlorn Hero" [level=3] [ref=e1082]
            - generic [ref=e1083]: 100%
          - generic [ref=e1084]:
            - generic [ref=e1085]: unit
            - generic [ref=e1086]: unit-ability
            - generic [ref=e1087]: space-marines
            - generic [ref=e1088]: blood angels
          - paragraph [ref=e1089]: Forlorn Hero (Datasheet) on Tycho The Lost — While this model is leading a unit, that unit is eligible to declare a charge in a turn in which it Advanced.
        - generic [ref=e1090]:
          - generic [ref=e1091]:
            - generic [ref=e1092]:
              - generic [ref=e1093]: "#90"
              - heading "Forlorn Hero" [level=3] [ref=e1094]
            - generic [ref=e1095]: 100%
          - generic [ref=e1096]:
            - generic [ref=e1097]: unit
            - generic [ref=e1098]: unit-ability
            - generic [ref=e1099]: space-marines
            - generic [ref=e1100]: blood angels
          - paragraph [ref=e1101]: Forlorn Hero (Datasheet) on Death Company Captain — While this model is leading a unit, unless that unit starts the battle embarked within a Transport, models in that un...
        - generic [ref=e1102]:
          - generic [ref=e1103]:
            - generic [ref=e1104]:
              - generic [ref=e1105]: "#91"
              - heading "Frenzied Reprisal" [level=3] [ref=e1106]
            - generic [ref=e1107]: 100%
          - generic [ref=e1108]:
            - generic [ref=e1109]: unit
            - generic [ref=e1110]: unit-ability
            - generic [ref=e1111]: space-marines
            - generic [ref=e1112]: blood angels
          - paragraph [ref=e1113]: Frenzied Reprisal (Datasheet) on Death Company Dreadnought with Magna-grapple — Each time an enemy unit targets this model, after that unit has finished making its attacks, this model can either sh...
        - generic [ref=e1114]:
          - generic [ref=e1115]:
            - generic [ref=e1116]:
              - generic [ref=e1117]: "#92"
              - heading "Fury Unbound" [level=3] [ref=e1118]
            - generic [ref=e1119]: 100%
          - generic [ref=e1120]:
            - generic [ref=e1121]: unit
            - generic [ref=e1122]: unit-ability
            - generic [ref=e1123]: space-marines
            - generic [ref=e1124]: blood angels
          - paragraph [ref=e1125]: Fury Unbound (Datasheet) on Lemartes — While this model is leading a unit, melee weapons equipped by models in that unit have the [LETHAL HITS] ability
        - generic [ref=e1126]:
          - generic [ref=e1127]:
            - generic [ref=e1128]:
              - generic [ref=e1129]: "#93"
              - heading "Gifted Commander" [level=3] [ref=e1130]
            - generic [ref=e1131]: 100%
          - generic [ref=e1132]:
            - generic [ref=e1133]: unit
            - generic [ref=e1134]: unit-ability
            - generic [ref=e1135]: space-marines
            - generic [ref=e1136]: blood angels
          - paragraph [ref=e1137]: Gifted Commander (Datasheet) on Captain Tycho — While this model is leading a unit, each time that unit is selected to shoot, select one of the following abilities t...
        - generic [ref=e1138]:
          - generic [ref=e1139]:
            - generic [ref=e1140]:
              - generic [ref=e1141]: "#94"
              - heading "Guardian of the Lost" [level=3] [ref=e1142]
            - generic [ref=e1143]: 100%
          - generic [ref=e1144]:
            - generic [ref=e1145]: unit
            - generic [ref=e1146]: unit-ability
            - generic [ref=e1147]: space-marines
            - generic [ref=e1148]: blood angels
          - paragraph [ref=e1149]: Guardian of the Lost (Datasheet) on Lemartes — While this model is leading a unit, each time an attack is allocated to a model in that unit, subtract 1 from the Dam...
        - generic [ref=e1150]:
          - generic [ref=e1151]:
            - generic [ref=e1152]:
              - generic [ref=e1153]: "#95"
              - heading "Heirs of Azkaellon" [level=3] [ref=e1154]
            - generic [ref=e1155]: 100%
          - generic [ref=e1156]:
            - generic [ref=e1157]: unit
            - generic [ref=e1158]: unit-ability
            - generic [ref=e1159]: space-marines
            - generic [ref=e1160]: blood angels
          - paragraph [ref=e1161]: Heirs of Azkaellon (Datasheet) on Sanguinary Guard — While a Character model is leading this unit, each time a melee attack targets this unit, subtract 1 from the Wound r...
        - generic [ref=e1162]:
          - generic [ref=e1163]:
            - generic [ref=e1164]:
              - generic [ref=e1165]: "#96"
              - heading "Leader" [level=3] [ref=e1166]
            - generic [ref=e1167]: 100%
          - generic [ref=e1168]:
            - generic [ref=e1169]: unit
            - generic [ref=e1170]: unit-ability
            - generic [ref=e1171]: space-marines
            - generic [ref=e1172]: blood angels
          - paragraph [ref=e1173]: Leader (Core) on Commander Dante — LEADER Mighty heroes fight at the forefront of battle. Some CHARACTER units have ‘Leader’ listed on their datasheets....
        - generic [ref=e1174]:
          - generic [ref=e1175]:
            - generic [ref=e1176]:
              - generic [ref=e1177]: "#97"
              - heading "Leader" [level=3] [ref=e1178]
            - generic [ref=e1179]: 100%
          - generic [ref=e1180]:
            - generic [ref=e1181]: unit
            - generic [ref=e1182]: unit-ability
            - generic [ref=e1183]: space-marines
            - generic [ref=e1184]: blood angels
          - paragraph [ref=e1185]: Leader (Core) on Captain Tycho — LEADER Mighty heroes fight at the forefront of battle. Some CHARACTER units have ‘Leader’ listed on their datasheets....
        - generic [ref=e1186]:
          - generic [ref=e1187]:
            - generic [ref=e1188]:
              - generic [ref=e1189]: "#98"
              - heading "Leader" [level=3] [ref=e1190]
            - generic [ref=e1191]: 100%
          - generic [ref=e1192]:
            - generic [ref=e1193]: unit
            - generic [ref=e1194]: unit-ability
            - generic [ref=e1195]: space-marines
            - generic [ref=e1196]: blood angels
          - paragraph [ref=e1197]: Leader (Core) on Tycho The Lost — LEADER Mighty heroes fight at the forefront of battle. Some CHARACTER units have ‘Leader’ listed on their datasheets....
        - generic [ref=e1198]:
          - generic [ref=e1199]:
            - generic [ref=e1200]:
              - generic [ref=e1201]: "#99"
              - heading "Leader" [level=3] [ref=e1202]
            - generic [ref=e1203]: 100%
          - generic [ref=e1204]:
            - generic [ref=e1205]: unit
            - generic [ref=e1206]: unit-ability
            - generic [ref=e1207]: space-marines
            - generic [ref=e1208]: blood angels
          - paragraph [ref=e1209]: Leader (Core) on Astorath — LEADER Mighty heroes fight at the forefront of battle. Some CHARACTER units have ‘Leader’ listed on their datasheets....
        - generic [ref=e1210]:
          - generic [ref=e1211]:
            - generic [ref=e1212]:
              - generic [ref=e1213]: "#100"
              - heading "Leader" [level=3] [ref=e1214]
            - generic [ref=e1215]: 100%
          - generic [ref=e1216]:
            - generic [ref=e1217]: unit
            - generic [ref=e1218]: unit-ability
            - generic [ref=e1219]: space-marines
            - generic [ref=e1220]: blood angels
          - paragraph [ref=e1221]: Leader (Core) on Sanguinary Priest — LEADER Mighty heroes fight at the forefront of battle. Some CHARACTER units have ‘Leader’ listed on their datasheets....
        - paragraph [ref=e1222]: Showing 100 of 3092 results
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | 
  3   | // ── App loads ───────────────────────────────────────────────────────────────
  4   | 
  5   | test.describe('Brain — app loads', () => {
  6   |   test('loads without auth gate', async ({ page }) => {
  7   |     await page.goto('/brain/')
  8   |     await page.waitForLoadState('networkidle')
  9   |     await expect(page.getByPlaceholder('Email')).not.toBeVisible()
  10  |     await expect(page.locator('h1')).toContainText('40K Brain')
  11  |   })
  12  | 
  13  |   test('shows all four tabs', async ({ page }) => {
  14  |     await page.goto('/brain/')
  15  |     await page.waitForLoadState('networkidle')
  16  |     // Tab buttons are in the header — use header scope to avoid matching form submit buttons
  17  |     const header = page.locator('header')
  18  |     await expect(header.getByRole('button', { name: 'Ask' })).toBeVisible()
  19  |     await expect(header.getByRole('button', { name: 'Search' })).toBeVisible()
  20  |     await expect(header.getByRole('button', { name: 'Browse' })).toBeVisible()
  21  |     await expect(header.getByRole('button', { name: 'Graph' })).toBeVisible()
  22  |   })
  23  | 
  24  |   test('Ask tab is default with input', async ({ page }) => {
  25  |     await page.goto('/brain/')
  26  |     await page.waitForLoadState('networkidle')
  27  |     await expect(page.getByPlaceholder(/Ask a 40K rules question/)).toBeVisible()
  28  |   })
  29  | })
  30  | 
  31  | // ── Search tab ──────────────────────────────────────────────────────────────
  32  | 
  33  | test.describe('Brain — Search tab', () => {
  34  |   test.beforeEach(async ({ page }) => {
  35  |     await page.goto('/brain/')
  36  |     await page.waitForLoadState('networkidle')
  37  |     await page.getByRole('button', { name: 'Search' }).click()
  38  |   })
  39  | 
  40  |   test('search input and button visible', async ({ page }) => {
  41  |     await expect(page.getByPlaceholder(/Semantic search/)).toBeVisible()
  42  |     await expect(page.getByRole('button', { name: 'Search' }).last()).toBeVisible()
  43  |   })
  44  | 
  45  |   test('search for "sustained hits" returns results', async ({ page }) => {
  46  |     await page.getByPlaceholder(/Semantic search/).fill('sustained hits')
  47  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  48  |     // Wait for results to appear
  49  |     await expect(page.locator('[class*="bg-slate-900"]').first()).toBeVisible({ timeout: 15000 })
  50  |     // Should have numbered results
  51  |     await expect(page.getByText('%').first()).toBeVisible()
  52  |   })
  53  | 
  54  |   test('search for "blood angels" returns faction-filtered results', async ({ page }) => {
  55  |     await page.getByPlaceholder(/Semantic search/).fill('blood angels')
  56  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  57  |     // Results should be visible — look for percentage scores from ResultCard
  58  |     await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
  59  |     // Should show faction banner — might take a moment to render after large result set
  60  |     await expect(page.getByText(/Filtered to/)).toBeVisible({ timeout: 10000 })
  61  |   })
  62  | 
  63  |   test('search for "necrons" returns results', async ({ page }) => {
  64  |     await page.getByPlaceholder(/Semantic search/).fill('necrons')
  65  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  66  |     // Results should be visible — look for percentage scores from ResultCard
  67  |     await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
  68  |   })
  69  | 
  70  |   test('search for "dark eldar" returns drukhari results', async ({ page }) => {
  71  |     await page.getByPlaceholder(/Semantic search/).fill('dark eldar')
  72  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  73  |     // Results should be visible — look for percentage scores from ResultCard
  74  |     await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
  75  |     // Results should show drukhari as the faction, not dark eldar
  76  |     await expect(page.getByText('drukhari').first()).toBeVisible()
  77  |   })
  78  | 
  79  |   test('search for "space wolves" returns SM subfaction results', async ({ page }) => {
  80  |     await page.getByPlaceholder(/Semantic search/).fill('space wolves')
  81  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  82  |     // Results should be visible — look for percentage scores from ResultCard
  83  |     await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
  84  |     await expect(page.getByText(/space wolves/i).first()).toBeVisible()
  85  |   })
  86  | 
  87  |   test('faction banner dismiss shows all results but keeps sort', async ({ page }) => {
  88  |     await page.getByPlaceholder(/Semantic search/).fill('blood angels')
  89  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  90  |     await expect(page.getByText(/Filtered to/)).toBeVisible({ timeout: 15000 })
  91  |     // Dismiss filter
  92  |     await page.getByText(/Show all/).click()
  93  |     // Banner should disappear
> 94  |     await expect(page.getByText(/Filtered to/)).not.toBeVisible()
      |                                                     ^ Error: expect(locator).not.toBeVisible() failed
  95  |     // Results should still be visible
  96  |     await expect(page.getByText('%').first()).toBeVisible()
  97  |   })
  98  | })
  99  | 
  100 | // ── Ask tab ─────────────────────────────────────────────────────────────────
  101 | 
  102 | test.describe('Brain — Ask tab', () => {
  103 |   // Workers AI LLM calls take 10-30 seconds
  104 |   test.setTimeout(60000)
  105 | 
  106 |   test.beforeEach(async ({ page }) => {
  107 |     await page.goto('/brain/')
  108 |     await page.waitForLoadState('networkidle')
  109 |   })
  110 | 
  111 |   test('ask "how does cover work" returns an answer', async ({ page }) => {
  112 |     await page.getByPlaceholder(/Ask a 40K rules question/).fill('how does cover work')
  113 |     await page.getByPlaceholder(/Ask a 40K rules question/).press('Enter')
  114 |     // Wait for the Sources section — it only appears after the answer loads
  115 |     await expect(page.getByText(/Sources/)).toBeVisible({ timeout: 45000 })
  116 |   })
  117 | 
  118 |   test('ask about blood angels shows answer', async ({ page }) => {
  119 |     await page.getByPlaceholder(/Ask a 40K rules question/).fill('blood angels sustained hits')
  120 |     await page.getByPlaceholder(/Ask a 40K rules question/).press('Enter')
  121 |     // Wait for Sources section to confirm answer loaded
  122 |     await expect(page.getByText(/Sources/)).toBeVisible({ timeout: 45000 })
  123 |   })
  124 | 
  125 |   test('ask shows answer content', async ({ page }) => {
  126 |     await page.getByPlaceholder(/Ask a 40K rules question/).fill('how does wound roll work')
  127 |     await page.getByPlaceholder(/Ask a 40K rules question/).press('Enter')
  128 |     // Wait for Sources section to confirm answer loaded
  129 |     await expect(page.getByText(/Sources/)).toBeVisible({ timeout: 45000 })
  130 |   })
  131 | })
  132 | 
  133 | // ── Browse tab ──────────────────────────────────────────────────────────────
  134 | 
  135 | test.describe('Brain — Browse tab', () => {
  136 |   test('Browse tab loads and shows layer navigation or sync prompt', async ({ page }) => {
  137 |     await page.goto('/brain/')
  138 |     await page.waitForLoadState('networkidle')
  139 |     await page.getByRole('button', { name: 'Browse' }).click()
  140 | 
  141 |     // Should show either the layer nav or a sync prompt — not nothing
  142 |     const hasLayerNav = await page.getByText('Core Rules').isVisible().catch(() => false)
  143 |     const hasSyncPrompt = await page.getByText(/sync/i).isVisible().catch(() => false)
  144 |     expect(hasLayerNav || hasSyncPrompt).toBe(true)
  145 |   })
  146 | })
  147 | 
  148 | // ── Graph tab ───────────────────────────────────────────────────────────────
  149 | 
  150 | test.describe('Brain — Graph tab', () => {
  151 |   test.beforeEach(async ({ page }) => {
  152 |     await page.goto('/brain/')
  153 |     await page.waitForLoadState('networkidle')
  154 |     await page.getByRole('button', { name: 'Graph' }).click()
  155 |   })
  156 | 
  157 |   test('shows search input and Visualize button', async ({ page }) => {
  158 |     await expect(page.getByPlaceholder(/Search to visualize/)).toBeVisible()
  159 |     await expect(page.getByRole('button', { name: 'Visualize' })).toBeVisible()
  160 |   })
  161 | 
  162 |   test('shows layer color legend', async ({ page }) => {
  163 |     await expect(page.getByText('core', { exact: true })).toBeVisible()
  164 |     await expect(page.getByText('faction', { exact: true })).toBeVisible()
  165 |     await expect(page.getByText('unit', { exact: true })).toBeVisible()
  166 |   })
  167 | 
  168 |   test('visualize "blood angels" renders graph without error', async ({ page }) => {
  169 |     await page.getByPlaceholder(/Search to visualize/).fill('blood angels')
  170 |     await page.getByRole('button', { name: 'Visualize' }).click()
  171 |     // Should not show an error — wait for the graph area to be present
  172 |     await page.waitForTimeout(3000)
  173 |     // No error message should be visible
  174 |     await expect(page.getByText(/error/i)).not.toBeVisible()
  175 |   })
  176 | })
  177 | 
  178 | // ── API endpoints direct ────────────────────────────────────────────────────
  179 | 
  180 | test.describe('Brain — API endpoints', () => {
  181 |   test('/search returns detected factions and results', async ({ request }) => {
  182 |     const res = await request.post('/brain/api/search', {
  183 |       data: { query: 'sustained hits', limit: 5 },
  184 |     })
  185 |     expect(res.ok()).toBe(true)
  186 |     const data = await res.json()
  187 |     expect(data.detected).toBeDefined()
  188 |     expect(data.results).toBeDefined()
  189 |     expect(data.results.length).toBeGreaterThan(0)
  190 |   })
  191 | 
  192 |   test('/search with faction detects and filters correctly', async ({ request }) => {
  193 |     const res = await request.post('/brain/api/search', {
  194 |       data: { query: 'blood angels death company', limit: 10 },
```