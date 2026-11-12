# Laskutus 2.0

GitHub Pages -yhteensopiva laskutusohjelma henkilökohtaiselle OneDrivelle.

## Päivitetty rekisterituki
- **Asiakasrekisteri**: ensimmäinen `Laskutussähköposti`-osoite on vastaanottaja, seuraavat puolipisteellä erotetut osoitteet ovat kopioita.
- **Tuoterekisteri**: `Tuotekoodi`, `Tuote`, `Yksikkö`, `Hinta, alv 0%`, `ALV`.
- **Laskuttajarekisteri**: kentät riveillä, jokainen laskuttaja omassa sarakkeessaan. Ohjelma näyttää laskuttajavalinnan.

## Sähköposti
Painike **Lataa PDF ja avaa sähköposti** lataa laskun PDF:n ja avaa laitteen oletussähköpostiohjelmaan valmiin viestin. Selain ei voi liittää paikallista tiedostoa mailto-linkkiin automaattisesti, joten PDF liitetään viestiin käsin.

## Henkilökohtainen OneDrive
Azure-palvelinta ei tarvita. Microsoft-kirjautumista varten tarvitaan kuitenkin Microsoft Entra -sovellusrekisteröinnin Client ID. Tiliasetuksena käytetään henkilökohtaiselle Microsoft-tilille tenant-arvoa `consumers`. Delegoidut oikeudet: `User.Read` ja `Files.ReadWrite`.

## GitHub Pages
Vie kaikki ZIP-paketin tiedostot repositorion juureen ja ota GitHub Pages käyttöön. Lisää sovellusrekisteröintiin SPA redirect URI GitHub Pages -osoitteelle.
