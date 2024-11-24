(async () => {
  const fetch = (await import('node-fetch')).default;
  const fs = require('fs').promises;
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const path = require('path'); 
//   const readline = require('readline');
  const crypto = require('crypto'); 

//   const rl = readline.createInterface({
//       input: process.stdin,
//       output: process.stdout
//   });

//   function askQuestion(query) {
//       return new Promise((resolve) => rl.question(query, (answer) => resolve(answer)));
//   }

  async function main() {
    //   const accessToken = await askQuestion("Enter your accessToken :");
    //   const id8 = await askQuestion("Enter your first 8 browserID :");
          // 文件路径
      const accessTokenFilePath = path.join(__dirname, 'access_token.txt');
      const id8FilePath = path.join(__dirname, 'browser_id_prefix.txt');
     const accessToken = await fs.readFile(accessTokenFilePath, 'utf-8');
     const id8 = await fs.readFile(id8FilePath, 'utf-8');


      let headers = {
          'Accept': 'application/json, text/plain, */*',
          'Connection': 'keep-alive',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
      };

      const browserIdFilePath = path.join(__dirname, 'browser_ids.json');

      async function coday(url, method, payloadData = null, proxy) {
          try {
              const agent = new HttpsProxyAgent(proxy);
              let response;
              const options = {
                  method: method,
                  headers: headers,
                  agent: agent
              };

              if (method === 'POST') {
                  options.body = JSON.stringify(payloadData);
                  response = await fetch(url, options);
              } else {
                  response = await fetch(url, options);
              }

              return await response.json();
          } catch (error) {
              console.error('Error with proxy:', proxy);
          }
      }

      function generateBrowserId() {
        const rdm = crypto.randomUUID().slice(8);
        const browserId = `${id8}${rdm}`
        return browserId;  
      }

      async function loadBrowserIds() {
          try {
              const data = await fs.readFile(browserIdFilePath, 'utf-8');
              return JSON.parse(data);
          } catch (error) {
              return {};  
          }
      }

      async function saveBrowserIds(browserIds) {
          try {
              await fs.writeFile(browserIdFilePath, JSON.stringify(browserIds, null, 2), 'utf-8');
              console.log('Browser IDs saved to file.');
          } catch (error) {
              console.error('Error saving browser IDs:', error);
          }
      }

      async function getBrowserId(proxy) {
          const browserIds = await loadBrowserIds();
          if (browserIds[proxy]) {
              console.log(`Using existing browser_id for proxy ${proxy}`);
              return browserIds[proxy];  
          } else {
              const newBrowserId = generateBrowserId();
              browserIds[proxy] = newBrowserId;  // Save new browser_id for the proxy
              await saveBrowserIds(browserIds);  
              console.log(`Generated new browser_id for proxy ${proxy}: ${newBrowserId}`);
              return newBrowserId;
          }
      }

      function getCurrentTimestamp() {
          return Math.floor(Date.now() / 1000);  
      }

      async function pingProxy(proxy, browser_id, uid) {
          const timestamp = getCurrentTimestamp();
          const pingPayload = { "uid": uid, "browser_id": browser_id, "timestamp": timestamp, "version": "1.0.0" };

          while (true) {
              try {
                  const pingResponse = await coday('https://api.aigaea.net/api/network/ping', 'POST', pingPayload, proxy);
                  console.log(`Ping successful for proxy ${proxy}:`, pingResponse);
                 if (!pingResponse) {
                        console.error(`Ping failed for proxy ${proxy}: Response is undefined or null`);
                        await new Promise(resolve => setTimeout(resolve, 5000));  
                        continue;
                  }
                  // Check the score 
                  if (pingResponse&&pingResponse.data && pingResponse.data.score < 50) {
                      console.log(`Score below 50 for proxy ${proxy}, re-authenticating...`);

                      // Re-authenticate and restart pinging with a new browser_id
                      await handleAuthAndPing(proxy);
                      break; 
                  }
              } catch (error) {
                  console.error(`Ping failed for proxy ${proxy}:`, error);
              }
              await new Promise(resolve => setTimeout(resolve, 600000));  // Wait 10 minutes before the next ping
          }
      }

      async function handleAuthAndPing(proxy) {
          const payload = {};
          const authResponse = await coday("https://api.aigaea.net/api/auth/session", 'POST', payload, proxy);
          
          if (authResponse && authResponse.data) {
              const uid = authResponse.data.uid;
              const browser_id = await getBrowserId(proxy);  // Get or generate a unique browser_id for this proxy
              console.log(`Authenticated for proxy ${proxy} with uid ${uid} and browser_id ${browser_id}`);

              // Start pinging 
              pingProxy(proxy, browser_id, uid);
          } else {
              console.error(`Authentication failed for proxy ${proxy}`);
          }
      }

      try {
          // Read proxies from proxy.txt
          const proxyList = await fs.readFile('proxy.txt', 'utf-8');
          const proxies = proxyList.split('\n').map(proxy => proxy.trim()).filter(proxy => proxy);

          if (proxies.length === 0) {
              console.error("No proxies found in proxy.txt");
              return;
          }

          const tasks = proxies.map(proxy => handleAuthAndPing(proxy));

          await Promise.all(tasks);

      } catch (error) {
          console.error('An error occurred:', error);
      }
  }

  main();
})();
