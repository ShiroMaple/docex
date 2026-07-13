import axios from 'axios';
import { wpsService } from '../src/services/wpsService.js';

async function checkSchema() {
  wpsService.appId = 'AK20260709WHJKYS';
  wpsService.appSecret = '5df141071670368b2aab9fca65fe50c8';
  wpsService.fileId = 'cbGbLglUXASe';

  try {
    const token = await wpsService.getAccessToken();
    const url = `https://openapi.wps.cn/v7/coop/dbsheet/cbGbLglUXASe/schema`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

checkSchema();
