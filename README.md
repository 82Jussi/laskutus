# Laskutus – rekisteröinnitön OneDrive-malli

Selainohjelma laskujen tekemiseen. Ei Microsoft-kirjautumista, Azurea eikä Client ID:tä.
Tiedostot kulkevat laitteen oman OneDrive-sovelluksen kautta.

## Tiedostot

`index.html`, `styles.css`, `config.js`, `storage.js`, `search.js`, `invoice.js`, `app.js`, `batch.js`,
`manifest.json` ja kuvakkeet. Rekisteri-Excel kuuluu OneDriven Laskutus-kansioon, ei GitHubiin.

## Käyttö

- **Tietokone (Edge/Chrome):** valitse kerran OneDriven Laskutus-kansio. Laskut tallentuvat `Laskut/vuosi`-kansioon.
- **Puhelin:** valitse rekisteri-Excel OneDrivesta. Tallenna lasku avaa jakovalikon.
- **Kirjekuori:** E5 (156 × 220 mm), ikkuna 30 × 90 mm, A4 kerran taitettuna.
- **Myyjänro** on sisäinen tieto (laskunumerointi), eikä se näy laskulla.

## Itselaskutus (Asetukset → Erityisominaisuudet)

- Rekisterin `Itselaskutus`-välilehti: Käytössä, Nimi, Osoite, Postinumero, Postitoimipaikka, Sähköposti,
  Tilinumero, Selite, Määrä, Yksikkö, Hinta alv 0%, ALV. Saman saajan (Nimi + Tilinumero) rivit tulevat yhdelle itselaskutukselle.
- **Ensimmäinen laskunumero:** muutos näkyy heti korteissa ja esikatselussa. Käsin annettu numero säilyy
  Päivitä-painikkeen ja välilehden vaihdon yli; erän muodostuksen jälkeen ohjelma ehdottaa taas seuraavaa vapaata numeroa.
- **Päivitä** lukee rekisterin uudelleen OneDrivesta (tietokone) ja laskee kortit uudelleen.
  Puhelimessa muuttunut rekisteri valitaan uudelleen Rekisteri-välilehdeltä.

## Tiekunnan laskutus

`Tiekunnat` ja `Tiekuntaosakkaat` -välilehdet. Toiminta kuten itselaskutuksessa, laskuissa viitenumero ja viivakoodi.
