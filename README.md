# Laskutus – rekisteröinnitön OneDrive-malli

Selainohjelma laskujen tekemiseen. Ei Microsoft-kirjautumista, Azurea eikä Client ID:tä.
Tiedostot: index.html, styles.css, config.js, storage.js, search.js, invoice.js, app.js, batch.js,
manifest.json ja kuvakkeet. Rekisteri-Excel kuuluu OneDriven Laskutus-kansioon, ei GitHubiin.

## Tiekunnan laskutus (Asetukset → Erityisominaisuudet → Tiekunnan laskutus)

Yksi tiekunta per rekisteri. Useammalle tiekunnalle tehdään oma rekisteritiedosto ja valitaan
se Rekisteri-välilehdeltä.

Rekisterin **Tiekunta**-välilehti:
- Yläosa: Tiekunta, Tie / selitelmä, Laskutusvuosi, Laskentatapa (Kokonaisbudjetti / Yksikköhinta),
  Ositeltava summa, Yksikköhinta, Perusmaksu (€ / maksaja), Perusmaksun teksti, Ylläpitomaksun teksti,
  ALV %, Laskun lisäteksti, Vahvistettu. `{vuosi}` korvautuu laskutusvuodella.
- Tieyksikköluettelo (yksi rivi per tienkäyttöyksikkö): Käytössä, Kiinteistö, Maksaja, Osoite,
  Postinumero, Postitoimipaikka, Sähköposti, Tienkäyttöyksikkö, Liikennelaji,
  Yksiköiden lkm, Painoluku, Matka (km), Matkan korjauskerroin, Painoluvun korjauskerroin,
  (Tieyksiköt, Osuus %, Osittelu € – tarkistuskaavat), Lisätieto.
- Tieyksiköt = lkm × painoluku × matka × korjauskertoimet (tyhjä kerroin = 1).

Laskutus:
- Jokainen maksaja saa yhden laskun: perusmaksu kerran ja ylläpitomaksu kiinteistöittäin
  (osuus = kiinteistön tieyksiköt / kaikki tieyksiköt × ositeltava summa, pyöristys senteiksi).
- Viitenumero muodostetaan aina laskunumerosta, joten pankkiviivakoodi tulostuu kaikille laskuille.
- Laskuttajaksi valitaan automaattisesti Laskuttajarekisterin laskuttaja, jonka Saaja on sama kuin tiekunnan nimi.
- Laskun lisäteksti tulee rekisteristä ja sitä voi muokata ohjelmassa ennen muodostusta.

### Ojitusyhteisön laskutus (Asetukset → Erityisominaisuudet → Ojitusyhteisön laskutus)

Yksi ojitusyhteisö per rekisteri. Rekisterin **Ojitusyhteisö**-välilehti:
- Yläosa: Ojitusyhteisö, Hanke, Laskutusvuosi, Laskurivin teksti, ALV %, Laskun lisäteksti.
- Kuivatusalueet: Kuivatusalue | Laskutettava summa (€) | Selite. Tyhjä tai 0 = aluetta ei laskuteta.
  Summia voi muuttaa myös ohjelmassa ennen laskujen muodostusta.
- Osakasluettelo (rivi per tila ja alue): Käytössä, Kuivatusalue, Kiinteistötunnus, Tilan nimi, Maksaja,
  Laskutusvastaanottaja, Osoite, Postinumero, Postitoimipaikka, Sähköposti, Muunnettu hyötyala (mha), Osuus %, Lisätieto.

Laskutus: tilan osuus = alueen summa × Osuus % / 100 (senteiksi pyöristettynä). Jokainen maksaja saa yhden laskun,
jossa jokainen laskutettava tila ja alue on omana rivinään. Ohjelma varoittaa, jos alueen osuudet eivät ole yhteensä 100 %.

### Laskurivit ja kertalasku
- Määrä ja hinta kirjoitetaan pilkulla (esim. 85,84). Negatiivinen summa (hyvitys) kirjoitetaan miinusmerkillä
  tai rivin ±-painikkeella, jota voi käyttää myös puhelimen numeronäppäimistöllä.
- **Kertalaskun asiakas – ei rekisterissä**: asiakkaan tiedot kirjoitetaan suoraan laskulle eikä niitä tallenneta
  rekisteriin. Laskulle ei tule asiakasnumeroa.

#### Päivämäärävalitsin
Kalenteripainike avaa ohjelman oman kalenterin, jossa viikko alkaa maanantaista laitteen kieliasetuksesta riippumatta.

#### Tuotevalinta laskuriveillä
Tuotekentän napautus avaa koko tuoterekisterin selattavaksi (kuten Asiakas-kenttä). Kirjoitettu hakusana suodattaa listaa,
ja kirjoitettu teksti jää vapaaksi riviksi, jos listasta ei valita tuotetta.
