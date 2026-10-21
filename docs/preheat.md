# Slim verwarmen

`custom:fluvy-preheat-card` toont de comforttemperatuur, het werkelijke aircodoel,
de Budget-stroomprijs, het volgende kansrijke voorverwarmmoment en de beslisreden.
Bij tijdelijk verlagen verschijnt de eindtijd onder `Terug naar comfort`.
Tik op de grote temperatuur voor het detailvenster. Plus en min veranderen alleen
de comfortinstelling, niet rechtstreeks de fysieke airco.

```yaml
type: custom:fluvy-preheat-card
entity: sensor.woonkamer_voorverwarming
name: Slim verwarmen
```

De kaart vereist de afzonderlijke `smart_preheat`-integratie uit
[Sacca-1/homelab](https://github.com/Sacca-1/homelab). De kaart leest bronkoppelingen
uit de beslissensor; er staan geen fysieke entity-ID's in de kaartimplementatie.
Alle instellingen en bronnen zijn in het detailvenster beschikbaar. De backend
valideert de eenheden en begrenst de klimaatbron tot LG ThinQ in het bij installatie
gekozen gebied. Alleen HA-beheerders mogen de configuratie wijzigen.

De formulierlabels zijn Nederlands. Vermogen, warmtecapaciteit en warmteverlies
zijn expliciete schattingen; een geschat financieel voordeel is geen gemeten
besparing. Niet gekoppelde verbruiksmetingen worden nooit als nul getoond.

`Slimme prijsregeling` schakelt zowel voorverwarmen als tijdelijk verlagen in of
uit. De maximale optimalisatieduur begrenst beide strategieën; de backend bewaakt
de financiële en comfortgrenzen. De bestaande kaarttype- en sensor-ID's blijven
compatibel met eerder opgeslagen dashboards.

De kaart heeft een eigen bundelmodule. Automatische dashboards kiezen deze
regelaar niet zelf: de eigenaar moet de beslissensor expliciet selecteren.

`Externe kamertemperatuur gebruiken` maakt de geselecteerde binnensensor leidend
via een afgevlakte correctie van het aircodoel. De kaart toont kamer- en
unitsensor, kamerdoel, correctie en terugvalstatus afzonderlijk. Standaard staat
het uit; correctie is maximaal ±2 °C en wordt over 15 minuten afgevlakt. Beide
zijn instelbaar. De backend bewaakt sensorversheid, fysieke grenzen en interval.
De comfortgrenzen gelden voor het kamerdoel; de gecompenseerde airco-instelling
kan daarbuiten liggen. Er wordt geen warmte- of besparingsgarantie gegeven.

Vanaf backend 1.3.0 wordt een oudere ThinQ-unitmeting zichtbaar gehouden met een
waarschuwing, terwijl de backend begrensd een statusverversing vraagt. De kaart
biedt ook instelbare proportionele kamerbijsturing, een rustzone en een aparte
instelinterval voor die bijsturing. Het afgevlakte sensorverschil en de
bijsturing samen vallen binnen de maximale correctie. Een warme kamer verlaagt
het aircodoel; koelen, uitschakelen en ventilatorwijzigingen worden niet aangevraagd.

De kaart biedt direct twee dagelijkse kloktijden met afzonderlijke schakelaars:
`Automatisch aan` (verwarmen) en `Automatisch uit`. Standaard staan beide uit,
met voorgeselecteerd 07:00 en 23:00. Wijzigingen worden direct opgeslagen via de
bestaande configuratieservice. De volgende schakeling en overgeslagen/mislukte
acties worden getoond. De backend gebruikt de lokale HA-tijd, voert elk moment
maximaal eenmaal per dag uit en respecteert handmatige pauze en andere modi.
Er is geen inhaalactie na uitval. Ontbrekende zomertijdminuten worden overgeslagen;
het dubbele wintertijduur voert dezelfde actie slechts eenmaal uit.
