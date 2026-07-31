const TIER1 = new Set([
  'gusttavo lima', 'henrique e juliano', 'marilia mendonca', 'jorge e mateus',
  'luan santana', 'wesley safadao', 'joao gomes', 'ana castela',
  'simone mendes', 'ivete sangalo', 'ferrugem', 'thiaguinho',
  'legiao urbana', 'tim maia', 'roberto carlos', 'queen',
  'bruno e marrone', 'ze neto e cristiano', 'nattan',
  'fernandinho', 'aline barros',
])

const TIER2 = new Set([
  'maiara e maraisa', 'matheus e kauan', 'hugo e guilherme',
  'israel e rodolffo', 'gustavo mioto', 'felipe araujo', 'murilo huff',
  'ze felipe', 'leonardo', 'eduardo costa', 'michel telo', 'luan pereira',
  'lauana prado', 'guilherme e benuto', 'simone e simaria',
  'mari fernandez', 'henry freitas', 'vitor fernandes', 'tarcisio do acordeon',
  'baroes da pisadinha', 'ze vaqueiro',
  'xand aviao', 'jonas esticado', 'matheus fernandes',
  'sorriso maroto', 'turma do pagode', 'pericles', 'grupo revelacao',
  'raca negra', 'dilsinho', 'belo', 'alexandre pires',
  'leo santana', 'bell marques', 'harmonia do samba', 'claudia leitte',
  'skank', 'charlie brown jr', 'raul seixas', 'capital inicial',
  'jota quest', 'barao vermelho', 'cassia eller', 'natiruts',
  'coldplay', 'bon jovi', 'guns n roses', 'michael jackson',
  'the beatles', 'acdc', 'nirvana', 'metallica',
  'anderson freire', 'gabriela rocha', 'preto no branco',
  'nadson', 'pablo', 'nadson ferinha',
  'djavan', 'gilberto gil', 'caetano veloso', 'chico buarque',
  'zeca pagodinho', 'alceu valenca', 'ze ramalho',
])

const TIER3 = new Set([
  'fernando e sorocaba', 'marcos e belutti', 'joao bosco e vinicius',
  'cristiano araujo', 'lucas lucco', 'naiara azevedo',
  'diego e victor hugo', 'chitaozinho e xororo', 'zeze di camargo',
  'paula fernandes', 'clayton e romario', 'bruno e barreto',
  'victor meira', 'antony e gabriel',
  'pedro sampaio', 'marcynho sensacao', 'aldair playboy',
  'biu do piseiro', 'alanzim coreano', 'japazin',
  'solange almeida', 'cavaleiros do forro', 'avioes do forro',
  'calcinha preta', 'limao com mel', 'saia rodada',
  'eric land', 'avine vinny', 'mano walter', 'thiago aquino',
  'junior vianna', 'tierry', 'gabriel diniz', 'felipe amorim',
  'lipe lucena', 'kadu martins',
  'exaltasamba', 'molejo', 'soweto', 'mumuzinho',
  'chiclete com banana', 'banda eva', 'parangole', 'daniela mercury',
  'psirico', 'asa de aguia',
  'paralamas do sucesso', 'engenheiros do hawaii', 'kid abelha',
  'lulu santos', 'rita lee', 'cidade negra', 'o rappa',
  'pitty', 'nx zero', 'detonautas', 'raimundos',
  'marisa monte', 'nando reis', 'ana carolina', 'jorge vercillo',
  'reginaldo rossi', 'amado batista', 'wando',
  'pink floyd', 'led zeppelin', 'aerosmith', 'red hot chili peppers',
  'dire straits', 'pearl jam', 'foo fighters', 'linkin park',
  'bruno mars', 'ed sheeran', 'u2', 'oasis',
  'eric clapton', 'scorpions', 'eagles', 'elton john',
  'devinho novaes', 'soro silva', 'silvanno salles', 'tayrone',
])

const _cache = new Map<string, number>()

export function getArtistScore(artist: string): number {
  const key = artist.toLowerCase().trim()
  if (_cache.has(key)) return _cache.get(key)!

  let score = 0
  if (TIER1.has(key)) score = 300
  else if (TIER2.has(key)) score = 200
  else if (TIER3.has(key)) score = 100
  else {
    for (const name of TIER1) {
      if (key.includes(name) || name.includes(key)) { score = 280; break }
    }
    if (!score) {
      for (const name of TIER2) {
        if (key.includes(name) || name.includes(key)) { score = 180; break }
      }
    }
    if (!score) {
      for (const name of TIER3) {
        if (key.includes(name) || name.includes(key)) { score = 80; break }
      }
    }
  }

  _cache.set(key, score)
  return score
}
