const Program = require("../models/Program")

// add single program
const addProgram = async(req,res)=>{
    try {
        const program = new Program(req.body)
        await program.save()
        res.status(201).json({msg: "program added successfully"})
    } catch (error) {
        res.status(500).json({msg: error.message})
    }
}

//all programs
const getPrograms = async(req,res)=>{
    try {
        const {semester, programName} = req.query

        let query = {}
        if(semester && programName){
            query = {
                semester: semester,
                programName: programName
            }
        }else if(semester){
            query = {
                semester: semester
            }
        }else if(programName){
            query = {
                programName: programName
            }
        }

        const programs = await Program.find(query).sort({semester: 1, programName: 1, courseName: 1})
        res.status(200).json({count: programs.length, programs})
    } catch (error) {
        res.status(500).json({msg: error.message})
    }
}



module.exports = {
    addProgram,
    getPrograms
}