/* global twemoji */

document.querySelector('#go').addEventListener('click', () => {
  const BASE_URL = 'https://cors-proxy.blaseball-reference.com/database';

  function getTable(gameId) {
    const div = document.querySelector(`div[data-id="${gameId}"]`);

    if (!div) {
      const clone = document.querySelector('#template-linescore').content.cloneNode(true);

      const alt = clone.querySelector('input');
      alt.addEventListener('focus', () => { alt.select(); });

      const inner = clone.querySelector('div.game');
      inner.dataset.id = gameId;
      document.body.append(inner);

      return getTable(gameId);
    }

    return {
      colgroup: div.querySelector('colgroup'),
      head: div.querySelector('.head'),
      away: div.querySelector('.away'),
      home: div.querySelector('.home'),
      foot: div.querySelector('.foot'),
      alt: div.querySelector('input'),
    };
  }

  function th(text, useTwemoji) {
    const element = document.createElement('th');
    element.innerText = text;
    if (useTwemoji) {
      twemoji.parse(element, { folder: 'svg', ext: '.svg' });
    }
    return element;
  }

  function td(text) {
    const element = document.createElement('td');
    element.innerText = text;
    return element;
  }

  function col(pad) {
    const element = document.createElement('col');
    if (pad) {
      element.classList.add('pad');
    }
    return element;
  }

  function emoji(e) {
    const n = Number(e);
    return Number.isNaN(n) ? e : String.fromCodePoint(n);
  }

  const ref = {};
  const score = {};
  const pitcherAlt = {};

  const tournaments = [
    { emoji: '☕', name: 'The Coffee Cup', tournament: 0 },
  ];

  const button = document.querySelector('#go');
  button.disabled = true;
  button.innerText = '...';

  document.querySelectorAll('div.game').forEach((table) => {
    if (table.dataset.id !== undefined) {
      table.remove();
    }
  });

  const query = { day: document.querySelector('#day').value - 1 };
  const season = document.querySelector('#season').value;
  const tournament = tournaments.find((t) => t.emoji === season);
  if (tournament === undefined) {
    query.season = season - 1;
  } else {
    query.tournament = tournament.tournament;
  }

  fetch(`${BASE_URL}/games?${new URLSearchParams(query)}`)
    .then((response) => response.json())
    .then((data) => {
      data.forEach((game) => {
        ref[game.statsheet] = game.id;
        score[game.id] = { away: game.awayScore, home: game.homeScore };

        const {
          colgroup, head, away, home, foot, alt,
        } = getTable(game.id);

        const date = `${tournament === undefined ? `Season ${game.season + 1}` : tournament.name}, Day ${game.day + 1}`;

        colgroup.append(col());
        head.append(td(date));
        away.append(th(`${emoji(game.awayTeamEmoji)} ${game.awayTeamName}`, true));
        home.append(th(`${emoji(game.homeTeamEmoji)} ${game.homeTeamName}`, true));

        if (game.gameComplete) {
          const wp = game.awayScore > game.homeScore ? game.awayPitcherName : game.homePitcherName;
          const lp = game.awayScore < game.homeScore ? game.awayPitcherName : game.homePitcherName;
          foot.querySelector('.wp').innerText = wp;
          foot.querySelector('.lp').innerText = lp;
          pitcherAlt[game.id] = `Winning pitcher: ${wp}. Losing pitcher: ${lp}.`;
        } else {
          foot.querySelector('td').innerHTML = '';
        }

        alt.value = `${date}. ${game.awayTeamName} at ${game.homeTeamName}.`;
      });

      const ids = data.map((game) => game.statsheet);
      return fetch(`${BASE_URL}/gameStatsheets?ids=${ids.join(',')}`);
    })
    .then((response) => response.json())
    .then((data) => {
      data.forEach((sheet) => {
        const gameId = ref[sheet.id];
        ref[sheet.awayTeamStats] = ['away', gameId];
        ref[sheet.homeTeamStats] = ['home', gameId];

        const {
          colgroup, head, away, home, foot, alt,
        } = getTable(gameId);

        foot.querySelector('td').colSpan = sheet.awayTeamRunsByInning.length + 3;

        [...new Array(sheet.awayTeamRunsByInning.length)].forEach((_, i) => {
          colgroup.append(col(i % 3 === 0));
          head.append(th(i + 1));
          away.append(td(sheet.awayTeamRunsByInning[i]));
          home.append(td(sheet.homeTeamRunsByInning[i] ?? '✕'));
          if (sheet.homeTeamRunsByInning[i] === undefined) {
            alt.value += ` Top of ${i + 1}: ${sheet.awayTeamRunsByInning[i]}.`;
          } else {
            alt.value += ` Inning ${i + 1}: ${sheet.awayTeamRunsByInning[i]} to ${sheet.homeTeamRunsByInning[i]}.`;
          }
        });

        colgroup.append(col(true));
        head.append(th('R'));
        away.append(th(score[gameId].away));
        home.append(th(score[gameId].home));
        alt.value += ` Score: ${score[gameId].away} to ${score[gameId].home}.`;
      });

      const ids = data.flatMap((sheet) => [sheet.awayTeamStats, sheet.homeTeamStats]);
      return fetch(`${BASE_URL}/teamStatsheets?ids=${ids.join(',')}`);
    })
    .then((response) => response.json())
    .then((data) => {
      const ids = data.flatMap((sheet) => {
        sheet.playerStats.forEach((id) => { ref[id] = ref[sheet.id]; });
        return sheet.playerStats;
      });
      const n = 200;
      const chunks = [...new Array(Math.ceil(ids.length / n))]
        .map((_, i) => ids.slice(n * i, n * i + n));
      return Promise.all(chunks.map((chunk) => fetch(`${BASE_URL}/playerStatsheets?ids=${chunk.join(',')}`)
        .then((response) => response.json())));
    })
    .then((data) => {
      const games = {};
      data.flat().forEach((sheet) => {
        const [which, gameId] = ref[sheet.id];
        if (games[gameId] === undefined) {
          games[gameId] = {};
        }
        games[gameId][which] = (games[gameId][which] ?? 0) + sheet.hits;
      });
      Object.entries(games).forEach(([gameId, { away: awayHits, home: homeHits }]) => {
        const {
          colgroup, head, away, home, alt,
        } = getTable(gameId);

        colgroup.append(col());
        head.append(th('H'));
        away.append(th(awayHits));
        home.append(th(homeHits));
        alt.value += ` Hits: ${awayHits} to ${homeHits}. ${pitcherAlt[gameId]}`;
      });
    })
    .catch((err) => {
      console.error(err); // eslint-disable-line no-console
      window.alert(err); // eslint-disable-line no-alert
    })
    .finally(() => {
      button.disabled = false;
      button.innerText = 'go';
    });

  return false;
});

document.querySelector('#coffee-cup').addEventListener('click', () => {
  document.querySelector('#season').value = '☕';
  return false;
});
