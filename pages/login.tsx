import { useRouter } from "next/router";
import { useEffect, useState } from "react";

const Login = () => {
    const [selectedOption, setSelectedOption] = useState<"records" | "verifier" | null>(null);
    const [userDetails, setUserDetails] = useState({ name: "", email: "" });
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [allUsers, setAllUsers] = useState<{ name: string; email: string }[]>([]);
    const router = useRouter();

    const handleOptionClick = (option: "records" | "verifier") => {
        setSelectedOption(option);
        setIsFormVisible(true);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setUserDetails((prevDetails) => ({
            ...prevDetails,
            [name]: value,
        }));
    };

    const [error, setError] = useState<string | null>(null);

    const handleSubmit = () => {
        const matchedUser = allUsers.find(
            (user) =>
                user.name.trim().toLowerCase() === userDetails.name.trim().toLowerCase() &&
                user.email.trim().toLowerCase() === userDetails.email.trim().toLowerCase()
        );

        if (!matchedUser) {
            setError(
                "Either the name or email is incorrect, please enter the proper credentials. If you feel something is wrong then please contact admin at dhruvsh2003@gmail.com."
            );
            return;
        }

        setError(null);

        const user = {
            ...userDetails,
            access: selectedOption,
        };

        localStorage.setItem("user", JSON.stringify(user));

        router.push("/");
    };

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await fetch("/api/all-email");
                if (!response.ok) throw new Error("Failed to fetch users");
                const data = await response.json();
                setAllUsers(data);
            } catch (error) {
                console.error("Error fetching users:", error);
            }
        }
        fetchUsers();
    },[])

    return (
        <div className="text-center mt-12">
            <h1 className="text-3xl font-bold">Welcome</h1>
            {(error || (!selectedOption && !isFormVisible)) && (
                <div className="mt-4 text-red-600 max-w-xl mx-auto">
                    <p>
                        {error && (
                            <>
                                {error}
                                <br />
                            </>
                        )}
                        If you are new to the application, please contact admin at <a href="mailto:dhruvsh2003@gmail.com" className="underline text-blue-700">dhruvsh2003@gmail.com</a> for access, providing the name and email you will use.
                    </p>
                </div>
            )}
            {!selectedOption && !isFormVisible && (
                <>
                    <p className="mt-4 text-lg">What are you here for?</p>
                    <div className="mt-6">
                        <button
                            onClick={() => handleOptionClick("records")}
                            className="bg-blue-500 text-white px-4 py-2 rounded-md mx-2 hover:bg-blue-600"
                        >
                            To Add New Records
                        </button>
                        <button
                            onClick={() => handleOptionClick("verifier")}
                            className="bg-red-500 text-white px-4 py-2 rounded-md mx-2 hover:bg-red-600"
                        >
                            To Verify Summaries
                        </button>
                    </div>
                </>
            )}
            {isFormVisible && (
                <div className="mt-8">
                    <h2 className="text-2xl font-semibold">Enter Your Details</h2>
                    <div className="mt-4">
                        <input
                            type="text"
                            name="name"
                            placeholder="Enter your name"
                            value={userDetails.name}
                            onChange={handleInputChange}
                            className="block w-4/5 mx-auto p-2 border border-gray-300 rounded-md mb-4"
                        />
                        <input
                            type="email"
                            name="email"
                            placeholder="Enter your email"
                            value={userDetails.email}
                            onChange={handleInputChange}
                            className="block w-4/5 mx-auto p-2 border border-gray-300 rounded-md mb-4"
                        />
                        <div className="flex justify-center mt-6">
                            <button
                                onClick={() => {
                                    setIsFormVisible(false);
                                    setSelectedOption(null);
                                }}
                                className="bg-gray-500 text-white px-4 py-2 rounded-md mx-2 hover:bg-gray-600"
                            >
                                Go Back
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="bg-blue-500 text-white px-4 py-2 rounded-md mx-2 hover:bg-blue-600"
                            >
                                Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Login;