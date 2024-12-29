var express = require('express');
var router = express.Router();
const zlib = require('zlib');
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
var dbApi = require('../database/dbapi');
var jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.SECRET_KEY;
const MAX_PAGES = 1;

async function fetchProducts(query, maxPages) {
  const products = [];
  // 将查询字符串编码为 GB2312，然后再进行 URL 编码
  const encodedQuery = iconv.encode(query, 'gb2312');
  const urlEncodedQuery = encodedQuery.toString('binary').split('').map(char => '%' + char.charCodeAt(0).toString(16).toUpperCase()).join('');

  console.log('encodedQuery: ', encodedQuery);
  console.log('urlEncodedQuery:', urlEncodedQuery);

  for (let page = 1; page <= maxPages; page++) {
    const response = await axios.get(`https://ss.manmanbuy.com/Default.aspx?PageID=${page}&key=${urlEncodedQuery}`, {
      responseType: 'arraybuffer',
      headers: {
        'Cookie': 'Hm_lvt_85f48cee3e51cd48eaba80781b243db3=1734870821,1735307346; HMACCOUNT=70FB92ECC9FE62F0; log-uid=826330596a7a4a85a0dddec1d6918968; ASP.NET_SessionId=surfnyysutdkezxcu34vj112; mmb_search_userid=43124dd72ec343edb96354c750d4c945; Hm_lvt_313c599bcf6e44393cebef6a2629f81e=1735312418; pc_20241225_jd=1735453077074; _gid=GA1.2.143182251.1735453078; usersearcherid=f8ded952789f4a348e659d2ba9a9ff09; 60014_mmbuser=AwgAA1NUUVNoBgkHWwUOVA5dAlsDUQJRAFJXV1oGVAcNVQkOVFoDV1Q%3d; mmb_search_pageid=ffd6776ce1704b3c99f014bf67d66b05; uibdfq=37; Hm_lpvt_313c599bcf6e44393cebef6a2629f81e=1735462091; _ga=GA1.1.439865380.1734870822; Hm_lpvt_85f48cee3e51cd48eaba80781b243db3=1735462704; _ga_1Y4573NPRY=GS1.1.1735453077.6.1.1735464038.0.0.0',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Accept-Charset': 'utf-8',
      }
    });

    let html;
    const encoding = response.headers['content-encoding'];
    if (encoding === 'gzip') {
      html = zlib.gunzipSync(response.data);
    } else if (encoding === 'deflate') {
      html = zlib.inflateSync(response.data);
    } else if (encoding === 'br') {
      html = zlib.brotliDecompressSync(response.data);
    } else {
      html = response.data;
    }

    const decodedHtml = iconv.decode(html, 'gb2312');
    const $ = cheerio.load(decodedHtml);

    // 从页面中提取商品信息
    $('.bjlineSmall.singlebj').each(async (index, element) => {
      const product_name = $(element).find('.title .t a').text().trim();
      const image_url = $(element).find('.pic img').attr('src');
      const current_price = parseFloat($(element).find('.cost .p .listpricespan').text().trim());
      const platform = $(element).find('.mall .m span').text().trim();
      const store_name = $(element).find('.mall .AreaZY').text().trim();
      const productUrl = $(element).find('.title .t a').attr('href');

      // 使用正则表达式提取所需的 URL
      const match = productUrl.match(/originalUrl=([^&]*)/);
      const product_url = match ? decodeURIComponent(match[1]) : productUrl;

      // console.log(`商品名称: ${product_name}, 价格: ${current_price}, 平台: ${platform}, 图片: ${image_url}, 链接: ${product_url}`);
      products.push({ product_name, image_url, current_price, platform, store_name, product_url });
    });
  }
  return products;
}

router.post('/search', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ success: false, message: '未提供token' });
  }

  jwt.verify(token.split(' ')[1], SECRET_KEY, async (err) => {
    if (err) {
      return res.status(401).json({ success: false, message: '无效的token' });
    }
    const { query } = req.body;
    try {
      const products = await fetchProducts(query, MAX_PAGES);
      res.status(200).json({ success: true, products });
    } catch (error) {
      console.error('获取商品错误:', error);
      res.status(500).json({ success: false, message: '获取商品失败' });
    }
  });
});

router.get('/products', async (req, res) => {
  try {
    const products = await dbApi.getProducts();
    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error('获取商品错误:', error);
    res.status(500).json({ success: false, message: '获取商品失败' });
  }
});

module.exports = router;