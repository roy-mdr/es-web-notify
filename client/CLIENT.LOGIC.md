
JSON UNICODE ESCAPED * (ej. ' = \u0027) (at least this character: ')


chunk 01:       ''12''123456789098                ''0''                                    ''1
chunk 02: 3''0987654321234                         ''15''1234512345
chunk 03: 12345                          '
chunk 04: '3''abc                   ''4'
chunk 05: 'wxyz                             
chunk 06: ''9''123
chunk 07: abc
chunk 08: XYZ                     
chunk 09:                      
chunk 10:       ''3''1bZ                     

separador: ''


0. ---------- si hay datos en memoria unelos al principio del chunk
no

0.1. ----- Pon MEM en nada!

1. ---------- divide la respuesta cada '' (se crea un array)

      ,12,123456789098                ,0,                                    ,1

2. ---------- revisa si la primera parte tiene conenido, si no, quitala.

12,123456789098                ,0,                                    ,1

3. ---------- hay minimo dos partes en el array? (bytes y contenido?)
                  si: continua!
                  no: añade a memoria contenido (si hay por lo menos 1 parte) y espera next chunk (next chunk comienza en 0)
si

4. ---------- lee cuantos bytes esperas de respuesta (12) y shift el array

123456789098                ,0,                                    ,1

5. ---------- si array[0] tiene igual o mas de los bytes que esperas,
                 leela hasta los bytes que esperas y procesalo (si los bytes que esperas no son 0)
                     hay mas de 1 item en el array?
                         si: shift el array y REPITE EL PROCESO DESDE EL PUNTO 2!
                         no: añade bytes restantes a memoria (si no estan vacios) y espera next chunk (next chunk comienza en 0)
                 si no, añade a memoria los bytes a leer + '' + contenido y espera next chunk (next chunk comienza en 0)

0,                                    ,1
(repeat)










2. no se elimina la primera parte
0,                                    ,1

3. si hay minimo dos partes! (hay 3)
0,                                    ,1

4. bytes a leer: 0
                                    ,1

5. se leen (0), se shift (porque hay mas de 1 item) y se repite
1

2. no se elimina la primera parte
1

3. NO HAY MINIMO DOS PARTES (hay 1)
(mem) 1


--- CHUNK 2


0. si
1 + 3''0987654321234                         ''15''1234512345

1.
13,0987654321234                         ,15,1234512345

2. no se elimina la primera parte
13,0987654321234                         ,15,1234512345

3. si hay minimo dos partes! (hay 4)
13,0987654321234                         ,15,1234512345

4. bytes a leer: 13
0987654321234                         ,15,1234512345

5. se leen (13), se shift (porque hay mas de un item) y se repite
15,1234512345

2. no se elimina la primera parte
15,1234512345

3. si hay minimo dos partes! (hay 2)
15,1234512345

4. bytes a leer: 15
1234512345

5. NO TIENE (15) BYTES! espera next chunk...
(mem) 15''1234512345


--- CHUNK 3


0. si
15''1234512345 + 12345                          '

1. 
15,123451234512345                          '

2. no se elimina la primera parte
15,123451234512345                          '

3. si hay minimo dos partes! (hay 2)

4. bytes a leer: 15
123451234512345                          '

5. se leen (15) y se añaden bytes restantes a memoria
(mem)                          '


--- CHUNK 4


0. si
                         ' + '3''abc                   ''4'

1.
,3,abc                   ,4'

2. se elimina la primera parte
3,abc                   ,4'

3. si hay minimo dos partes! (hay 3)
3,abc                   ,4'

4. bytes a leer: 3
abc                   ,4'

5. se leen (3), se shift y repite desde 2
4'

2. no se elimina la primera parte

3. NO HAY MINIMO DOS PARTES (hay 1)
(mem) 4'


--- CHUNK 5


0. si
4' + 'wxyz                             

1.
4,wxyz                             

2. No se elimina la primera parte
4,wxyz                             

3. si hay minimo dos partes! (hay 2)
4,wxyz                             

4. bytes a leer: 4
wxyz                             

5. se leen (4) no se añaden bytes restantes a memoria (vacio)


--- CHUNK 6


0. no
''9''123

1. 
                            ,9,123

2. Se elimina la primera parte
9,123

3. si hay minimo dos partes! (hay 2)

4. bytes a leer: 9
123

5. NO TIENE (9) BYTES! espera next chunk...
(mem) 9''123


--- CHUNK 7


0. si
9''123 + abc

1.
9,123abc

2. No se elimina la primera parte
9,123abc

3. si hay minimo dos partes! (hay 2)

4. bytes a leer: 9
123abc

5. NO TIENE (9) BYTES! espera next chunk...
(mem) 9''123abc


--- CHUNK 8


0. si
9''123abc + XYZ

1.
9,123abcXYZ

2. No se elimina la primera parte
9,123abcXYZ

3. si hay minimo dos partes! (hay 2)

4. bytes a leer: 9
123abcXYZ

5. se leen (9), no se añade nada a memoria


--- CHUNK 9


0. no
                      

1.
                      

2. Se elimina la primera parte
[null]

3. NO HAY MINIMO DOS PARTES (hay 0)


--- CHUNK 10


0. no
      ''3''1bZ                     

1.
      ,3,1bZ                     

2. Se elimina la primera parte
3,1bZ                     

3. si hay minimo dos partes! (hay 2)

4. bytes a leer: 3
1bZ

5. se leen (3), no se añade nada a memoria