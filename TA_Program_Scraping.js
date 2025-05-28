document.getElementById('extract').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.textContent = 'Status: Searching for program_ids...';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.statusUpdate) {
      status.textContent = `Status: ${message.statusUpdate}`;
    }
  });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const baseUrl = 'https://mlb25.theshow.com';
      const teamLinks = Array.from(document.querySelectorAll('a[href*="/programs/team_affinity_by_team"]'))
        .map(a => baseUrl + a.getAttribute('href'));

      const programIds = [];

      const sendStatus = (msg) => {
        chrome.runtime.sendMessage({ statusUpdate: msg });
      };

      (async () => {
        sendStatus('Searching for programs...');
        for (const url of teamLinks) {
          try {
            const response = await fetch(url);
            const htmlText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');

            const programLinks = doc.querySelectorAll('a[href*="program_id="]');
            programLinks.forEach(link => {
              const href = link.getAttribute('href');
              const params = new URLSearchParams(href.split('?')[1]);
              const programId = params.get('program_id');
              const teamID = params.get('team_id');
              if (programId) {
                programIds.push({ programId, teamID });
              }
            });

          } catch (error) {
            console.error(`Error fetching ${url}:`, error);
          }
        }

        sendStatus(`Found ${programIds.length} programs.`);

        let count = 0;
        for (const { programId, teamID } of programIds) {
          const programUrl = `${baseUrl}/programs/program_view?group_id=10015&league=al&program_id=${programId}&team_id=${teamID}`;
          try {
            const response = await fetch(programUrl);
            const htmlText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');
            const paragraphs = doc.querySelectorAll('p');
            const results = [];

            paragraphs.forEach(p => {
              const meter = p.querySelector('meter');
              if (meter) {
                results.push({
                  text: p.textContent.trim(),
                  meterMax: meter.getAttribute('max'),
                  meterValue: meter.getAttribute('value')
                });
              }
            });

            if (results.length > 0) {
              let csvContent = "data:text/csv;charset=utf-8,";
              csvContent += "text,meter_max,meter_value\n";
              results.forEach(row => {
                csvContent += `"${row.text.replace(/"/g, '""')}","${row.meterMax}","${row.meterValue}"\n`;
              });

              const encodedUri = encodeURI(csvContent);
              const link = document.createElement("a");
              link.setAttribute("href", encodedUri);
              link.setAttribute("download", `program_${programId}_team_${teamID}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }

            count++;
            sendStatus(`${count} of ${programIds.length} files downloaded`);

          } catch (error) {
            console.error(`Error fetching ${programUrl}:`, error);
          }
        }
      })();
    }
  });
});
