$docxPath = "C:\Users\MAEJOY\scim\SCIM_Audit_and_Fix_Guide.docx"
$bytes = [System.IO.File]::ReadAllBytes($docxPath)
$text = [System.Text.Encoding]::ASCII.GetString($bytes)
$cleanText = $text -replace '[^\x20-\x7E\r\n\t]', ' ' -replace '\s+', ' '
$cleanText | Out-File -FilePath "C:\Users\MAEJOY\scim\extracted_content.txt" -Encoding UTF8
Write-Output "Content extracted to extracted_content.txt"