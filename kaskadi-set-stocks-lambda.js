const es = require('aws-es-client')({
  id: process.env.ES_ID,
  token: process.env.ES_SECRET,
  url: process.env.ES_ENDPOINT
})

module.exports.handler = async (event) => {
  const { stockData, warehouse, idType } = event
  const body = await createBulkBody(stockData, warehouse, idType)
  // await es.bulk({
  //   refresh: true,
  //   body
  // })
}

async function createBulkBody(stockData, warehouse, idType) {
  stockData = await transformStockData(stockData, warehouse, idType)
  return stockData.flatMap(processStockData(warehouse, idType)).concat([
    {
      update: {
        _id: warehouse,
        _index: "warehouses"
      }
    },
    {
      doc: {
        stockLastUpdated: Date.now()
      }
    }
  ])
}

async function transformStockData(stockData, warehouse, idType) {
  if (idType === 'ASIN') {
    let searchBody = { from: 0, size: 5000, query: { match: {} } }
    searchBody.query.match[`asin.${warehouse}`] = stockData.map(data => data.id).join(' ')
    const searchData = await es.search({ index: 'products', body: searchBody })
    stockData = searchData.body.hits.hits.map(doc => {
      return {
        ...stockData.filter(data => doc._source.asin[warehouse].includes(data.id))[0],
        docId: doc._id
      }
    })
  } else {
    stockData = stockData.map(data => {
      return {
        ...data,
        docId: data.id
      }
    })
  }
  return stockData
}

function processStockData(warehouse, idType) {
  return data => {
    let body = { doc: { stocks: {} } }
    let stock = { idType, stockMap: {} }
    stock.stockMap[data.id] = {
      quantity: data.quantity,
      condition: data.condition || ''
    }
    body.doc.stocks[warehouse] = stock
    return [{ update: { _id: data.docId, _index: 'products' } }, body]
  }
}