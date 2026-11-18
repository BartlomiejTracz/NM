# Manewry Morskie

Frontend: TypeScript, Canvas, Vite. Backend: Node.js, Express, Socket.IO.
Wymagany Node.js 22.12+ (testowano na 24.15). Polecenia z katalogu głównego:

```sh
npm run setup
npm run build
npm test
```

Uruchomienie lokalne w dwóch terminalach:

```sh
npm --prefix nm-server start
npm --prefix nm-game run dev
```

## Wdrożenie

- Wdrażaj frontend i backend razem. Nowy protokół nie współpracuje ze starym klientem opartym na `sync_action`.
- Backend: katalog roboczy `nm-server`, instalacja `npm ci`, kontrola `npm run build`, start `npm start`. Hosting musi udostępnić także katalog `shared` z tego samego repozytorium.
- Frontend: katalog roboczy `nm-game`, instalacja `npm ci`, budowanie `npm run build`, wynik `dist`. Podczas budowania potrzebny jest także `shared`.
- `PORT`: port backendu, domyślnie 3000.
- `VITE_SERVER_URL`: adres backendu ustawiony przy budowaniu frontendu. Lokalnie domyślnie `http://localhost:3000`; dotychczasowy adres Render pozostaje wartością domyślną dla produkcji.
- `ALLOWED_ORIGINS`: opcjonalna lista adresów frontendu oddzielonych przecinkami. Ograniczenie CORS nie zastępuje autoryzacji sesji.

Serwer przechowuje pokoje w pamięci jednego procesu. Restart usuwa trwające partie; wdrożenie wielu instancji wymaga wspólnego magazynu stanu i koordynacji zapisu. Aktualna implementacja nie deklaruje trwałości po restarcie.

## Stan i bezpieczeństwo

- `shared/` jest wspólnym źródłem reguł. Katalogi `engine` eksportują te moduły dla zgodności ścieżek.
- Serwer tworzy planszę, normalizuje flotę, nadaje nieprzewidywalne identyfikatory jednostek i rozstrzyga akcje.
- Sesja przypisuje połączeniu pokój i rolę. Losowy token wznowienia pozostaje w `sessionStorage` danej karty i nigdy nie jest częścią widoku gry.
- Klient dostaje tylko swój widok: nieznane typy przeciwnika są oznaczone `unknown`, aktywne miny przeciwnika są widoczne jako kontakty `unknown`. Dziennik nie ujawnia typu przemieszczanej jednostki ani miejsca postawienia miny.
- Akcja zawiera `roomId`, `gameId`, `actionId`, `expectedRevision`. Walidacja i zapis są synchroniczne w jednym procesie. Powtórzone akcje nie wykonują się ponownie; stara rewizja wymusza synchronizację.
- Klient nie aktualizuje partii optymistycznie. Utrata potwierdzenia powoduje odczyt aktualnego widoku, a rozłączenie usuwa kolejkę starych intencji.
- Rozłączenie wstrzymuje ruchy. Sesję można wznowić przez 120 sekund; po tym czasie gracz przegrywa rozpoczętą partię. Wyjście podczas przygotowań zamyka pokój, a podczas gry oznacza poddanie.
- Pokoje wygasają po godzinie bezczynności. Liczba pokoi, połączeń, żądań i rozmiar komunikatów mają limity. Dziennik zawiera ostatnie 200 komunikatów.

## Przyjęte reguły i zapis floty

- Jednakowe jednostki niszczą się wzajemnie; desant nie może atakować.
- Zachowano ruch ze zmianą kierunku, dotychczasowy zasięg ostrzału bez dodatkowej kontroli przeszkód, limit sześciu jednocześnie aktywnych min i internowanie po czwartej własnej turze zakończonej w strefie neutralnej.
- Wszystkie kontakty, w tym miny, blokują zwykły ruch. Atak na minę niszczy okręt i minę; rozminowanie przez trałowiec usuwa wyłącznie minę.
- Rozminowanie wskazuje pole, nie tajny identyfikator miny. Przeszukanie pustego pola także zużywa turę, aby komunikat błędu nie służył do darmowego wykrywania min. Przeszukanie kontaktu, który nie jest miną, zużywa turę bez niszczenia jednostki. Nie można stawiać min na zajętych polach.
- Zapis floty ma format wersji 2, współrzędne kanoniczne gracza A i wymiary planszy. Obrót używa wymiarów planszy; brak ręcznych przesunięć kolumn.
- Poprawne stare tablice flot są migrowane po walidacji. Uszkodzone stare zapisy, np. z pozycjami poza planszą, są odrzucane bez nadpisywania zapisu.

## Testy

`npm test` sprawdza typy testów i uruchamia testy domenowe oraz rzeczywiste lokalne połączenia Socket.IO, w tym podszywanie się pod gracza, tajność flot, niepoprawne komunikaty, deduplikację, wyścig akcji, wyjście i odzyskiwanie sesji. Testy wymagają zależności obu paczek (`npm run setup`) i dostępu do połączeń na `127.0.0.1`.

## Plansza i ostatnie ruchy

- Otwarte narożniki portów można opłynąć po skosie, jeśli przynajmniej jedna strona narożnika nie przecina muru. Zamknięta granica portu pozostaje nieprzekraczalna.
- Ślady ruchu są zapisywane na serwerze i synchronizowane z graczami. Zawierają rzeczywistą trasę, bez typu okrętu; wygasają po dwóch turach graczy.
- Współrzędne A–R / 1–12 są widoczne na czterech krawędziach planszy. Dziennik używa tych samych oznaczeń.

## Ustawienia lobby i notatki gracza
- Host wybiera opcję „Gra z liniami trasy” przy tworzeniu pokoju (domyślnie włączona). Serwer zapisuje ją dla obu graczy; wyłączenie oznacza brak zapisu i wysyłania śladów.
- Ręczny licznik strat przeciwnika zapisuje się przy każdym kliknięciu w localStorage, osobno dla identyfikatora partii i strony gracza. Przełączenie karty, odświeżenie i ponowne połączenie zachowują notatki w tej przeglądarce; nowa partia ma oddzielny licznik.
