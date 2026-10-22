' Abre a ponte do FarmaRotina sem nenhuma janela.
' O iniciar.bat continua cuidando de reiniciar a ponte se ela parar; o que ela escreve vai para ponte.log.
' Para abrir junto com o Windows: Win + R -> shell:startup -> colar ali um atalho deste arquivo.
' Para encerrar: parar.bat
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c """"" & pasta & "\iniciar.bat"" oculto""", 0, False
