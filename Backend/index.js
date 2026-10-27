import express from "express"

const app = express()
app.get("/", (req, res) => {
  res.send(
    "Hello From Backend"
  )
})

app.listen(4000, () => {
  console.log("PORT IS RUNNING ON 4000")
})
