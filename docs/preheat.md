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
