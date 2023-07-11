const mongoose = require('mongoose')

const ProgramSchema = mongoose.Schema({
    courseName: {type: String},
    semester: {type: Number},
    programName: {type: String}
})

module.exports = mongoose.model("Program", ProgramSchema)