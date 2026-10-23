/**
 * Voz de quem gravou (masculina/feminina) para sugerir o tom certo ao músico.
 * Lista dos artistas mais comuns no repertório; desconhecido = sem sugestão.
 */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

const FEM = [
  'marilia mendonca', 'maiara e maraisa', 'maiara', 'simone mendes', 'simone e simaria', 'ana castela', 'naiara azevedo', 'lauana prado',
  'paula fernandes', 'roberta miranda', 'mari fernandez', 'solange almeida', 'taty girl', 'joelma', 'ivete sangalo', 'claudia leitte',
  'anitta', 'ludmilla', 'luisa sonza', 'iza', 'marisa monte', 'elis regina', 'rita lee', 'pitty', 'kid abelha', 'paula toller',
  'ana carolina', 'maria gadu', 'vanessa da mata', 'sandy', 'wanessa', 'wanessa camargo', 'alcione', 'beth carvalho', 'ana vilela',
  'aline barros', 'gabriela rocha', 'cassiane', 'bruna karla', 'damares', 'fernanda brum', 'eyshila', 'sarah farias', 'nivea soares',
  'isadora pompeo', 'midian lima', 'valesca mayssa', 'priscila senna', 'michele andrade', 'raquel dos teclados', 'paula mattos',
  'adele', 'dua lipa', 'taylor swift', 'mariah carey', 'whitney houston', 'beyonce', 'lady gaga', 'rihanna', 'shakira', 'madonna',
  'celine dion', 'amy winehouse', 'katy perry', 'billie eilish', 'ariana grande', 'christina aguilera', 'alanis morissette', 'no doubt',
  'roxette', 'cranberries', 'the cranberries', 'tina turner', 'cyndi lauper', 'gloria gaynor', 'calcinha preta', 'banda calypso',
  'mc loma', 'gal costa', 'maria bethania', 'marina sena', 'manu bahtidao', 'yasmin santos', 'lauana', 'clara nunes',
]
const MASC = [
  'gusttavo lima', 'henrique e juliano', 'jorge e mateus', 'ze neto e cristiano', 'matheus e kauan', 'luan santana', 'bruno e marrone',
  'zeze di camargo', 'zeze e luciano', 'leonardo', 'leandro e leonardo', 'chitaozinho e xororo', 'eduardo costa', 'murilo huff',
  'wesley safadao', 'xand aviao', 'nattan', 'joao gomes', 'tarcisio do acordeon', 'baroes da pisadinha', 'os baroes da pisadinha',
  'thiaguinho', 'pericles', 'sorriso maroto', 'ferrugem', 'dilsinho', 'menos e mais', 'turma do pagode', 'pixote', 'raca negra',
  'exaltasamba', 'revelacao', 'mumuzinho', 'belo', 'zeca pagodinho', 'arlindo cruz', 'harmonia do samba', 'jota quest', 'skank',
  'legiao urbana', 'charlie brown jr', 'barao vermelho', 'cazuza', 'titas', 'capital inicial', 'engenheiros do hawaii', 'os paralamas do sucesso',
  'paralamas do sucesso', 'raimundos', 'cpm 22', 'o rappa', 'djavan', 'tim maia', 'lulu santos', 'roupa nova', 'ze ramalho', 'alceu valenca',
  'raul seixas', 'fabio jr', 'roberto carlos', 'caetano veloso', 'gilberto gil', 'seu jorge', 'jorge ben jor', 'amado batista',
  'reginaldo rossi', 'fernandinho', 'thales roberto', 'andre valadao', 'anderson freire', 'isaias saad', 'davi sacer', 'kleber lucas',
  'michel telo', 'israel e rodolffo', 'hugo e guilherme', 'diego e victor hugo', 'gustavo mioto', 'felipe araujo', 'joao bosco e vinicius',
  'cesar menotti e fabiano', 'victor e leo', 'luan pereira', 'ze felipe', 'guilherme e benuto', 'jonas esticado', 'eric land',
  'pearl jam', 'metallica', 'guns n roses', 'dire straits', 'nirvana', 'linkin park', 'bon jovi', 'queen', 'elton john', 'eric clapton',
  'michael jackson', 'bruno mars', 'ed sheeran', 'coldplay', 'oasis', 'the beatles', 'creedence clearwater revival', 'aerosmith',
  'foo fighters', 'green day', 'pink floyd', 'u2', 'maroon 5', 'red hot chili peppers', 'bee gees', 'phil collins', 'scorpions',
]

const FEM_N = FEM.map(norm), MASC_N = MASC.map(norm)

export function artistVoice(artist: string): 'fem' | 'masc' | null {
  const a = norm(artist)
  if (!a) return null
  if (FEM_N.some(f => a === f || a.startsWith(f + ' ') || a.endsWith(' ' + f))) return 'fem'
  if (MASC_N.some(m => a === m || a.startsWith(m + ' ') || a.endsWith(' ' + m))) return 'masc'
  return null
}

/** Quantos semitons sugerir: voz masculina cantando música de cantora desce 2 tons; o contrário sobe 2 tons */
export function suggestedShift(userVoice: 'masc' | 'fem' | null, artist: string): number {
  if (!userVoice) return 0
  const v = artistVoice(artist)
  if (!v || v === userVoice) return 0
  return userVoice === 'masc' ? -4 : 4
}
