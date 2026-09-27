# Load required assemblies
Add-Type -AssemblyName System.IO.Compression.FileSystem

$docxPath = "C:\Users\MAEJOY\Downloads\SCIM_Audit_and_Fix_Guide (1).docx"
$outputPath = "C:\Users\MAEJOY\scim\document_content.txt"

try {
    # Open the docx file as a zip archive
    $zip = [System.IO.Compression.ZipFile]::OpenRead($docxPath)
    
    # Find the document.xml file
    $entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
    
    if ($entry) {
        # Extract and read the XML content
        $stream = $entry.Open()
        $reader = New-Object System.IO.StreamReader($stream)
        $xmlContent = $reader.ReadToEnd()
        $reader.Close()
        $stream.Close()
        
        # Extract text from XML (remove tags and clean up)
        $textContent = $xmlContent -replace '<[^>]+>', ' ' -replace '\s+', ' '
        
        # Write to output file
        $textContent | Out-File -FilePath $outputPath -Encoding UTF8
        
        Write-Output "Document content extracted successfully to: $outputPath"
        Write-Output "Extracted text length: $($textContent.Length) characters"
    } else {
        Write-Output "Error: word/document.xml not found in the docx file"
    }
    
    $zip.Dispose()
} catch {
    Write-Output "Error: $($_.Exception.Message)"
}