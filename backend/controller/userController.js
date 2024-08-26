import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js"
import ErrorHandler from "../middlewares/error.js"
import { User } from "../models/userSchema.js"
import {v2 as cloudinary } from "cloudinary";
import { generateToken } from "../utils/jwtToken.js";
import { sendEmail } from "../utils/sendEmail.js";
import crypto from "crypto";


export const register = catchAsyncErrors(async(req,res,next) =>{
   
    if(!req.files || Object.keys(req.files).length === 0 ) {
        return next(new ErrorHandler("Avatar And Resume Are Required",400));
    }
    console.log(req.files)
    const {avatar,resume} =req.files;

    // console.log("AVATAR",avatar)
    //POSTING AVATAR
    const cloudinaryResponseForAvatar =await cloudinary.uploader.upload(
        avatar.tempFilePath,
        { folder: "AVATARS"}
    );
    if (!cloudinaryResponseForAvatar || cloudinaryResponseForAvatar.error){
        console.error(
            "Cloudinary Error:",
            cloudinaryResponseForAvatar.error || "Unknown Cloudinary Error"
        );
    }

    // const {resume}= req.files;
    
    // console.log("RESUME",resume)

    //POSTING RESUME
    const cloudinaryResponseForResume =await cloudinary.uploader.upload(
        resume.tempFilePath,
        { folder: "RESUME"}
    );
    if (!cloudinaryResponseForResume || cloudinaryResponseForResume.error){
        console.error(
            "Cloudinary Error:",
            cloudinaryResponseForResume.error || "Unknown Cloudinary Error"
        );
        return next(new ErrorHandler("Failed to upload resume to cloudinary",500));
    }

const {
    fullname,
    email,
    phone,
    aboutMe,
    password,
    portfolioURL,
    githubURL,
    instagramURL,
    linkedInURL, 
} = req.body;
const user =await User.create({
    fullname,
    email,
    phone,
    aboutMe,
    password,
    portfolioURL,
    githubURL,
    instagramURL,
    linkedInURL, 
    avatar:{
        public_id: cloudinaryResponseForAvatar.public_id,
        url:cloudinaryResponseForAvatar.secure_url,
    },
    resume:{
        public_id:cloudinaryResponseForResume.public_id,
        url:cloudinaryResponseForResume.secure_url,
    },
});
// res.status(200).json({
//     sucess:true,
//     message:"User Registered",
// });
generateToken(user,"User Registered!",201,res)
});


export const login = catchAsyncErrors(async(req,res,next)=> {
    const { email,password }= req.body;
    if (!email || !password){
        return next(new ErrorHandler("Email And Password Are  Required"));
    }
    const user = await User.findOne ({ email}).select("+password");
    if (!user){
        return next(new ErrorHandler("Invaild Email or Password!"));
    }
    const isPasswordMatched =await user.comparePassword(password);
    if (!isPasswordMatched){
        return next(new ErrorHandler("Invaild Email Or Password!"));
    }
    generateToken(user,"Logged In" , 200,res);
});


export const logout = catchAsyncErrors(async(req,res,next) => {
    res
    .status(200)
    .cookie("token","",{
        expires:new Date(Date.now()),
        httpOnly:true,
    })
    .json({
        success:true,
        message: "Logged Out",
    });
});


export const getUser = catchAsyncErrors(async(req,res,next) =>{
    const user =await User.findById(req.user.id);
    res.status(200).json({
        success:true,
        user,
    });
});

export const updateProfile = catchAsyncErrors(async(req,res,next)=>{
    const newUserData ={
        fullName: req.body.fullName,
        email: req.body.email,
        phone: req.body.phone,
        aboutMe: req.body.aboutMe,
        portfolioURL: req.body.portfolioURL,
        githubURL: req.body.githubURL,
        instagramURL: req.body.instagramURL,
        linkedInURL: req.body.linkedInURL, 
    }; 
    if (req.files && req.files.avatar) {
        const avatar = req.files.avatar;
        const user = await User.findById(req.user.id);
        const profileImageId = user.avatar.public_id;
        await cloudinary.uploader.destroy(profileImageId);
        const newProfileImage = await cloudinary.uploader.upload(
            avatar.tempFilePath,
            {folder:"AVATARS"}
        );
        newUserData.avatar = {
            public_id: newProfileImage.public_id,
            url:newProfileImage.secure_url,
        };
    };
    if (req.files && req.files.resume) {
        const resume = req.files.resume;
        const user = await User.findById(req.user.id);
        const resumeFileId = user.resume.public_id;
        await cloudinary.uploader.destroy(resumeFileId);
        const newResume = await cloudinary.uploader.upload(
            resume.tempFilePath,
            {folder:"RESUME"}
        );
        newUserData.resume = {
            public_id:newResume.public_id,
            url:newResume.secure_url,
        };
    }

    const user = await User.findByIdAndUpdate(req.user.id,newUserData, {
        new: true,
        runValidators: true,
        useFindAndModify: false,
    })
     res.status(200).json({
        success: true,
        message: "Profile Updated!",
        user,
     });
});

export const updatePassword = catchAsyncErrors(async (req,res,next) =>{
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmNewPassword){
        return next(new ErrorHandler("Please fill All Fields.",400));
    }
    const user = await User.findById(req.user.id).select("+password");
    const isPasswordMatched = await user.comparePassword(currentPassword);
    if (!isPasswordMatched){
        return next(new ErrorHandler("Incorrect Current Password.",400));
    }
    if (newPassword !== confirmNewPassword) {
        return next(
            new ErrorHandler(
                "New password and confirm new password do not match.",400
            )
        );
    }
    user.password =newPassword;
    await user.save();
    res.status(200).json({
        success:true,
        message:"Password Updated!"
    })
});

export const getUserForPortfolio = catchAsyncErrors(async(req,res,next)=> {
    const id ="66c6176305390e8968546838";
    const user = await User.findById(id);
    res.status(200).json({
        success:true,
        user,
    })
})

//FORGOT PASSWORD
export const forgotPassword = catchAsyncErrors(async (req,res,next) => {
    const user = await User.findOne({ email:req.body.email });
    if (!user) {
        return next(new ErrorHandler("User not found!",400));
    }
    const resetToken = user.getResetPasswordToken();
    await user.save({validateBeforeSave:false});
    const resetPasswordUrl =`${process.env.DASHBOARD_URL}/password/reset/${resetToken}`;
    const message =`Your reset password token is:- \n\n ${resetPasswordUrl}\n\n if you've not request for this please ignore it.`

    try{
        await sendEmail({
            email: user.email,
            subject: "Personal Portfolio dashboard recovery password",
            message,
        });
        res.status(200).json({
            success:true,
            message: `Email sent to  ${user.email} successfully!`,
        });
    } catch (error) {
          user.resetPasswordExpire = undefined;
          user.resetPasswordToken = undefined;
          await user.save();
          return next(new ErrorHandler(error.message,500));
    }

});

//RESET PASSWORD

export const resetPassword = catchAsyncErrors(async(req,res,next)=>{
    const { token } =req.params;
    const resetPasswordToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

    const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire:{$gt: Date.now() },
    });
    if (!user) {
        return next(
            new ErrorHandler("Reset password token is invalid or has been expired",400)
        );
    }
    if(req.body.password !== req.body.confirmPassword){
        return next(new ErrorHandler("Password & confirm password do not match"));
    }
    user.password =req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
   
    await user.save();
    generateToken(user, "Reset password successfully!",200,res);
});
 